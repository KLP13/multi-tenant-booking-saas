import { validateRequest } from '../middleware/validate';
import {
  createResourceSchema,
  updateResourceSchema,
  adminWalkInSchema,
  markPaidSchema,
  inviteStaffSchema,
  adminBookingsQuerySchema,
  blockSlotSchema,
  idParamSchema,
} from '../schemas';
import { confirmBookingWithConflictCheck } from '../services/bookingConfirmation';
import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { releaseLock, storeOtp } from '../lib/redis';
import { sendBookingCancellationEmail, sendBookingConfirmationEmail, sendStaffInviteEmail } from '../lib/email';

const router = Router();

// All admin routes require authentication
router.use(authenticate);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/me
// Returns the currently logged in user info and tenant with business settings
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            currency: true,
            address: true,
            phone: true,
            logoUrl: true,
            cancellationPolicy: true,
          },
        },
      },
    });

    if (!user) {
      throw createError(404, 'User not found');
    }

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/profile
// Update business settings, contact info, and cancellation policy
// -----------------------------------------------------------------------------
// GET /api/admin/resources
// List all resources for the authenticated tenant with filtering & pagination
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// PUT /api/admin/profile
// Update business settings, contact info, and cancellation policy (Admin only)
// -----------------------------------------------------------------------------
router.put('/profile', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, phone, address, logoUrl, cancellationPolicy, currency } = req.body;

    const dataToUpdate: any = {};
    if (name !== undefined) dataToUpdate.name = String(name).trim();
    if (phone !== undefined) dataToUpdate.phone = String(phone).trim();
    if (address !== undefined) dataToUpdate.address = String(address).trim();
    if (logoUrl !== undefined) dataToUpdate.logoUrl = String(logoUrl).trim();
    if (cancellationPolicy !== undefined) dataToUpdate.cancellationPolicy = String(cancellationPolicy).trim();
    if (currency !== undefined) dataToUpdate.currency = String(currency).trim();

    const updatedTenant = await prisma.tenant.update({
      where: { id: req.user!.tenantId },
      data: dataToUpdate,
    });

    res.json({
      success: true,
      tenant: updatedTenant,
      message: 'Business settings updated successfully',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/resources', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, minCapacity, maxCapacity, isActive, page, limit, sortBy, sortOrder } = req.query;

    const whereClause: any = {
      tenantId: req.user!.tenantId,
    };

    if (search && typeof search === 'string') {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (minCapacity || maxCapacity) {
      whereClause.capacity = {};
      if (minCapacity) whereClause.capacity.gte = Number(minCapacity);
      if (maxCapacity) whereClause.capacity.lte = Number(maxCapacity);
    }

    if (isActive !== undefined) {
      whereClause.isActive = isActive === 'true';
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const sortField = typeof sortBy === 'string' && ['name', 'capacity', 'hourlyRateCents', 'createdAt'].includes(sortBy) ? sortBy : 'createdAt';
    const sortDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const [total, resources] = await Promise.all([
      prisma.resource.count({ where: whereClause }),
      prisma.resource.findMany({
        where: whereClause,
        orderBy: { [sortField]: sortDir },
        skip,
        take: limitNum,
      }),
    ]);

    res.json({
      resources,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// GET /api/admin/resources/:id
// Get single resource with booking metrics
// -----------------------------------------------------------------------------
router.get('/resources/:id', validateRequest(idParamSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const resource = await prisma.resource.findFirst({
      where: { id, tenantId: req.user!.tenantId },
      include: {
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });

    if (!resource) {
      throw createError(404, 'Resource not found');
    }

    const upcomingBookingsCount = await prisma.booking.count({
      where: {
        resourceId: id,
        tenantId: req.user!.tenantId,
        startTime: { gte: new Date() },
        status: { in: ['CONFIRMED', 'PENDING'] },
      },
    });

    res.json({
      resource,
      metrics: {
        totalBookings: resource._count.bookings,
        upcomingBookings: upcomingBookingsCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// POST /api/admin/resources
// Create a new resource with strict capacity and schedule validation
// -----------------------------------------------------------------------------
router.post('/resources', requireRole('ADMIN', 'SUPER_ADMIN'), validateRequest(createResourceSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      description,
      hourlyRateCents,
      capacity,
      bufferMinutes,
      openTime,
      closeTime,
      slotDurationMinutes,
      operatingDays,
    } = req.body;

    if (!name || hourlyRateCents === undefined) {
      throw createError(400, 'Name and hourlyRateCents are required');
    }

    const rateNum = Number(hourlyRateCents);
    if (!Number.isInteger(rateNum) || rateNum < 0) {
      throw createError(400, 'hourlyRateCents must be a non-negative integer');
    }

    const capNum = capacity !== undefined ? Number(capacity) : 1;
    if (!Number.isInteger(capNum) || capNum < 1 || capNum > 1000) {
      throw createError(400, 'Capacity must be an integer between 1 and 1000');
    }

    const bufferNum = bufferMinutes !== undefined ? Number(bufferMinutes) : 0;
    if (!Number.isInteger(bufferNum) || bufferNum < 0 || bufferNum > 180) {
      throw createError(400, 'bufferMinutes must be between 0 and 180');
    }

    const finalOpen = openTime || '08:00';
    const finalClose = closeTime || '20:00';
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(finalOpen) || !timeRegex.test(finalClose)) {
      throw createError(400, 'openTime and closeTime must match format HH:mm');
    }
    if (finalOpen >= finalClose) {
      throw createError(400, 'openTime must be before closeTime');
    }

    const durationNum = slotDurationMinutes !== undefined ? Number(slotDurationMinutes) : 60;
    if (![15, 30, 45, 60, 90, 120].includes(durationNum)) {
      throw createError(400, 'slotDurationMinutes must be one of: 15, 30, 45, 60, 90, 120');
    }

    const resource = await prisma.resource.create({
      data: {
        tenantId: req.user!.tenantId,
        name: name.trim(),
        description: description ? description.trim() : null,
        hourlyRateCents: rateNum,
        capacity: capNum,
        bufferMinutes: bufferNum,
        openTime: finalOpen,
        closeTime: finalClose,
        slotDurationMinutes: durationNum,
        operatingDays: operatingDays || 'MON,TUE,WED,THU,FRI,SAT,SUN',
        isActive: true,
      },
    });

    res.status(201).json({ resource });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// PUT /api/admin/resources/:id
// Update a resource with capacity validation
// -----------------------------------------------------------------------------
router.put('/resources/:id', requireRole('ADMIN', 'SUPER_ADMIN'), validateRequest(updateResourceSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const {
      name,
      description,
      hourlyRateCents,
      capacity,
      bufferMinutes,
      openTime,
      closeTime,
      slotDurationMinutes,
      operatingDays,
      isActive,
    } = req.body;

    const existing = await prisma.resource.findFirst({
      where: { id, tenantId: req.user!.tenantId },
    });

    if (!existing) {
      throw createError(404, 'Resource not found');
    }

    if (capacity !== undefined) {
      const capNum = Number(capacity);
      if (!Number.isInteger(capNum) || capNum < 1 || capNum > 1000) {
        throw createError(400, 'Capacity must be an integer between 1 and 1000');
      }
    }

    if (hourlyRateCents !== undefined) {
      const rateNum = Number(hourlyRateCents);
      if (!Number.isInteger(rateNum) || rateNum < 0) {
        throw createError(400, 'hourlyRateCents must be a non-negative integer');
      }
    }

    if (bufferMinutes !== undefined) {
      const bufferNum = Number(bufferMinutes);
      if (!Number.isInteger(bufferNum) || bufferNum < 0 || bufferNum > 180) {
        throw createError(400, 'bufferMinutes must be between 0 and 180');
      }
    }

    const effectiveOpen = openTime || existing.openTime;
    const effectiveClose = closeTime || existing.closeTime;
    if (openTime || closeTime) {
      const timeRegex = /^\d{2}:\d{2}$/;
      if (!timeRegex.test(effectiveOpen) || !timeRegex.test(effectiveClose)) {
        throw createError(400, 'openTime and closeTime must match format HH:mm');
      }
      if (effectiveOpen >= effectiveClose) {
        throw createError(400, 'openTime must be before closeTime');
      }
    }

    const updated = await prisma.resource.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description ? description.trim() : null }),
        ...(hourlyRateCents !== undefined && { hourlyRateCents: Number(hourlyRateCents) }),
        ...(capacity !== undefined && { capacity: Number(capacity) }),
        ...(bufferMinutes !== undefined && { bufferMinutes: Number(bufferMinutes) }),
        ...(openTime !== undefined && { openTime: effectiveOpen }),
        ...(closeTime !== undefined && { closeTime: effectiveClose }),
        ...(slotDurationMinutes !== undefined && { slotDurationMinutes: Number(slotDurationMinutes) }),
        ...(operatingDays !== undefined && { operatingDays }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });

    res.json({ resource: updated });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
router.put('/resources/:id', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const {
      name,
      description,
      hourlyRateCents,
      capacity,
      bufferMinutes,
      openTime,
      closeTime,
      slotDurationMinutes,
      operatingDays,
      isActive,
    } = req.body;

    const existing = await prisma.resource.findFirst({
      where: { id, tenantId: req.user!.tenantId },
    });

    if (!existing) {
      throw createError(404, 'Resource not found');
    }

    const updated = await prisma.resource.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(hourlyRateCents !== undefined && { hourlyRateCents: Number(hourlyRateCents) }),
        ...(capacity !== undefined && { capacity: Number(capacity) }),
        ...(bufferMinutes !== undefined && { bufferMinutes: Number(bufferMinutes) }),
        ...(openTime !== undefined && { openTime }),
        ...(closeTime !== undefined && { closeTime }),
        ...(slotDurationMinutes !== undefined && { slotDurationMinutes: Number(slotDurationMinutes) }),
        ...(operatingDays !== undefined && { operatingDays }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });

    res.json({ resource: updated });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/resources/:id
// Soft delete (deactivate) a resource
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/resources/:id', requireRole('ADMIN', 'SUPER_ADMIN'), validateRequest(idParamSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const existing = await prisma.resource.findFirst({
      where: { id, tenantId: req.user!.tenantId },
    });

    if (!existing) {
      throw createError(404, 'Resource not found');
    }

    await prisma.resource.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({ success: true, message: 'Resource deactivated' });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/slots/block
// Administrative slot hold for maintenance or private booking
// ─────────────────────────────────────────────────────────────────────────────
router.post('/slots/block', validateRequest(blockSlotSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { resourceId, date, startTime, endTime, reason } = req.body;

    if (!resourceId || !date || !startTime || !endTime) {
      throw createError(400, 'resourceId, date, startTime, and endTime are required');
    }

    const startDt = new Date(`${date}T${startTime}:00.000Z`);
    const endDt = new Date(`${date}T${endTime}:00.000Z`);

    // Create a confirmed blocking reservation
    const booking = await prisma.booking.create({
      data: {
        tenantId: req.user!.tenantId,
        resourceId,
        customerName: `[BLOCKED] ${reason || 'Maintenance / Private'}`,
        customerEmail: 'admin@blocked.internal',
        startTime: startDt,
        endTime: endDt,
        status: 'CONFIRMED',
        totalAmountCents: 0,
      },
      include: {
        resource: { select: { name: true } },
      },
    });

    res.status(201).json({ success: true, booking });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/bookings
// List bookings for the tenant with optional filters
// ─────────────────────────────────────────────────────────────────────────────
router.get('/bookings', validateRequest(adminBookingsQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { resourceId, status, date } = req.query;

    const where: any = {
      tenantId: req.user!.tenantId,
    };

    if (resourceId && typeof resourceId === 'string') {
      where.resourceId = resourceId;
    }

    if (status && typeof status === 'string') {
      where.status = status;
    }

    if (date && typeof date === 'string') {
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      const dayEnd = new Date(`${date}T23:59:59.999Z`);
      where.startTime = { gte: dayStart, lte: dayEnd };
    }

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        resource: { select: { name: true, hourlyRateCents: true } },
      },
      orderBy: { startTime: 'desc' },
    });

    res.json({ bookings });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/bookings/export
// Download all bookings as CSV for accounting and taxation
// ─────────────────────────────────────────────────────────────────────────────
router.get('/bookings/export', validateRequest(adminBookingsQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { tenantId: req.user!.tenantId },
      include: { resource: { select: { name: true } } },
      orderBy: { startTime: 'desc' },
    });

    const headers = ['Booking ID', 'Customer Name', 'Customer Email', 'Resource', 'Start Time', 'End Time', 'Status', 'Amount (INR)', 'Created At'];
    const rows = bookings.map((b) => [
      b.id,
      `"${b.customerName.replace(/"/g, '""')}"`,
      b.customerEmail,
      `"${(b.resource?.name || 'Resource').replace(/"/g, '""')}"`,
      b.startTime.toISOString(),
      b.endTime.toISOString(),
      b.status,
      (b.totalAmountCents / 100).toFixed(2),
      b.createdAt.toISOString(),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="bookings-export.csv"');
    res.status(200).send(csvContent);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/bookings/:id/cancel
// Cancel a booking
// ─────────────────────────────────────────────────────────────────────────────
router.put('/bookings/:id/cancel', validateRequest(idParamSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const booking = await prisma.booking.findFirst({
      where: { id, tenantId: req.user!.tenantId },
      include: {
        resource: true,
        tenant: true,
      },
    });

    if (!booking) {
      throw createError(404, 'Booking not found');
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'CANCELLED', lockExpiresAt: null },
      include: {
        resource: true,
        tenant: true,
      },
    });

    // Release lock if any
    const dateStr = booking.startTime.toISOString().split('T')[0];
    const timeStr = booking.startTime.toISOString().split('T')[1].slice(0, 5);
    await releaseLock(booking.resourceId, dateStr, timeStr, booking.id);

    // Send cancellation email if customer is not internal admin
    if (booking.customerEmail && !booking.customerEmail.includes('@blocked.internal')) {
      sendBookingCancellationEmail({
        booking: updated,
        resource: updated.resource,
        tenant: updated.tenant,
      }).catch((err) => console.error('Failed to send cancellation email via admin:', err));
    }

    res.json({ success: true, booking: updated });
  } catch (err) {
    next(err);
  }
});



// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/bookings/walk-in
// In-person / Counter Staff Walk-in Booking with Cash Payment
// Accessible by: STAFF, ADMIN, SUPER_ADMIN
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/bookings/walk-in
// In-person / Counter Staff Walk-in Booking with Cash Payment
// Accessible by: STAFF, ADMIN, SUPER_ADMIN
// ─────────────────────────────────────────────────────────────────────────────
router.post('/bookings/walk-in', requireRole('STAFF', 'ADMIN', 'SUPER_ADMIN'), validateRequest(adminWalkInSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      resourceId,
      date,
      startTime,
      endTime,
      customerName,
      customerPhone,
      customerEmail,
      amountPaidCents,
    } = req.body;

    if (!resourceId || !date || !startTime || !endTime || !customerName) {
      throw createError(400, 'resourceId, date, startTime, endTime, and customerName are required');
    }

    const tenantId = req.user!.tenantId;

    // Fetch staff / admin creator details
    const staffUser = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!staffUser) {
      throw createError(401, 'Staff session invalid');
    }

    // Verify resource belongs to this tenant and is active
    const resource = await prisma.resource.findFirst({
      where: { id: resourceId, tenantId, isActive: true },
      include: { tenant: true },
    });

    if (!resource) {
      throw createError(404, 'Resource not found or inactive');
    }

    const startDt = new Date(`${date}T${startTime}:00.000Z`);
    const endDt = new Date(`${date}T${endTime}:00.000Z`);

    if (isNaN(startDt.getTime()) || isNaN(endDt.getTime()) || startDt >= endDt) {
      throw createError(400, 'Invalid start or end time specified');
    }

    // Strict validation: Reject past time slots
    if (startDt <= new Date()) {
      throw createError(400, 'Cannot book a time slot in the past. Please select an upcoming available slot.');
    }

    // Check for conflicting confirmed bookings or locks
    const conflict = await prisma.booking.findFirst({
      where: {
        resourceId,
        status: 'CONFIRMED',
        startTime: { lt: endDt },
        endTime: { gt: startDt },
      },
    });

    if (conflict) {
      throw createError(409, 'This slot is already booked and confirmed.');
    }

    const totalAmount =
      amountPaidCents !== undefined && amountPaidCents !== null
        ? Number(amountPaidCents)
        : resource.hourlyRateCents;

    const emailToRecord =
      customerEmail && customerEmail.trim()
        ? customerEmail.trim().toLowerCase()
        : staffUser.email;

    const fullName = customerName.trim() + (customerPhone ? ` (${customerPhone.trim()})` : '');

    const booking = await prisma.booking.create({
      data: {
        tenantId,
        resourceId,
        userId: staffUser.id,
        customerName: fullName,
        customerEmail: emailToRecord,
        startTime: startDt,
        endTime: endDt,
        status: 'CONFIRMED',
        totalAmountCents: totalAmount,
        razorpayPaymentId: `cash_counter_${Date.now()}`,
        lockExpiresAt: null,
      },
      include: {
        resource: true,
        tenant: true,
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    // Release any pending Redis hold lock on this slot
    const timeStr = startTime.slice(0, 5);
    await releaseLock(resourceId, date, timeStr, booking.id);

    // If customer provided a distinct genuine email, dispatch confirmation email
    if (customerEmail && customerEmail.trim().toLowerCase() !== staffUser.email.toLowerCase()) {
      sendBookingConfirmationEmail({
        booking,
        resource: booking.resource,
        tenant: booking.tenant,
      }).catch((err) => console.error('Failed to dispatch walk-in confirmation email:', err));
    }

    res.status(201).json({
      success: true,
      booking,
      message: `Walk-in cash booking confirmed by ${staffUser.name || staffUser.email}`,
    });
  } catch (err) {
    next(err);
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/bookings/:id/mark-paid
// Mark an offline / cash payment as received and confirm the booking
// ─────────────────────────────────────────────────────────────────────────────
router.post('/bookings/:id/mark-paid', requireRole('STAFF', 'ADMIN', 'SUPER_ADMIN'), validateRequest(markPaidSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const existing = await prisma.booking.findFirst({
      where: { id, tenantId: req.user!.tenantId },
    });

    if (!existing) {
      throw createError(404, 'Booking not found');
    }

    const { booking, alreadyConfirmed } = await confirmBookingWithConflictCheck({
      bookingId: id,
      paymentMethod: 'CASH',
      razorpayPaymentId: `cash_manual_${Date.now()}`,
    });

    res.json({
      success: true,
      message: alreadyConfirmed ? 'Booking was already confirmed' : 'Booking marked as paid and confirmed successfully',
      booking,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/analytics
// Restricted to ADMIN & SUPER_ADMIN — total revenue, count, breakdown
// ─────────────────────────────────────────────────────────────────────────────
router.get('/analytics', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;

    const [totalBookings, confirmedBookings, pendingBookings, cancelledBookings] = await Promise.all([
      prisma.booking.count({ where: { tenantId } }),
      prisma.booking.count({ where: { tenantId, status: 'CONFIRMED' } }),
      prisma.booking.count({ where: { tenantId, status: 'PENDING' } }),
      prisma.booking.count({ where: { tenantId, status: 'CANCELLED' } }),
    ]);

    const revenueResult = await prisma.booking.aggregate({
      where: { tenantId, status: 'CONFIRMED' },
      _sum: { totalAmountCents: true },
    });

    const totalRevenueCents = revenueResult._sum.totalAmountCents || 0;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { currency: true, name: true },
    });

    res.json({
      analytics: {
        totalRevenueCents,
        currency: tenant?.currency || 'INR',
        totalBookings,
        confirmedBookings,
        pendingBookings,
        cancelledBookings,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Team & Staff Management (RBAC)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/team — List team members for this business
router.get('/team', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const team = await prisma.user.findMany({
      where: { tenantId: req.user!.tenantId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ team });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/team — Invite / create a team member with STAFF or ADMIN role
router.post('/team', requireRole('ADMIN', 'SUPER_ADMIN'), validateRequest(inviteStaffSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, role = 'STAFF' } = req.body;

    if (!email) {
      throw createError(400, 'Email is required');
    }

    if (!['STAFF', 'ADMIN'].includes(role)) {
      throw createError(400, 'Role must be either STAFF or ADMIN');
    }

    const cleanEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({
      where: {
        tenantId_email: {
          tenantId: req.user!.tenantId,
          email: cleanEmail,
        },
      },
    });

    if (existing) {
      throw createError(409, 'A team member with this email already exists in your workspace');
    }

    const [tenant, inviter] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: req.user!.tenantId } }),
      prisma.user.findUnique({ where: { id: req.user!.userId }, select: { name: true } }),
    ]);

    if (!tenant) {
      throw createError(404, 'Tenant not found');
    }

    let passwordHash: string;
    let inviteToken: string | null = null;

    if (password && password.trim().length >= 6) {
      passwordHash = await bcrypt.hash(password.trim(), 10);
    } else {
      const randomSecret = crypto.randomBytes(32).toString('hex');
      passwordHash = await bcrypt.hash(randomSecret, 10);
      inviteToken = crypto.randomBytes(32).toString('hex');
    }

    const member = await prisma.user.create({
      data: {
        tenantId: req.user!.tenantId,
        email: cleanEmail,
        passwordHash,
        name: name || '',
        role: role as any,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    if (inviteToken) {
      const tokenPayload = JSON.stringify({
        userId: member.id,
        email: cleanEmail,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        role,
      });
      await storeOtp(`staff_invite:${inviteToken}`, tokenPayload, 86400);

      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      const setupUrl = `${clientUrl}/${tenant.slug}/staff/setup?token=${inviteToken}`;

      sendStaffInviteEmail({
        email: cleanEmail,
        staffName: name || 'Team Member',
        businessName: tenant.name,
        inviterName: inviter?.name || 'Your Team Administrator',
        role,
        setupUrl,
      }).catch((err) => console.error('Failed to send staff invite email:', err));
    }

    res.status(201).json({
      success: true,
      member,
      inviteSent: !!inviteToken,
      message: inviteToken
        ? `Invitation email sent to ${cleanEmail}`
        : 'Team member created successfully',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/team/:id/resend-invite — Resend invitation email
router.post('/team/:id/resend-invite', requireRole('ADMIN', 'SUPER_ADMIN'), validateRequest(idParamSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const member = await prisma.user.findFirst({
      where: { id, tenantId: req.user!.tenantId },
      include: { tenant: true },
    });

    if (!member) {
      throw createError(404, 'Team member not found');
    }

    const inviter = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { name: true },
    });

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const tokenPayload = JSON.stringify({
      userId: member.id,
      email: member.email,
      tenantId: member.tenantId,
      tenantSlug: member.tenant.slug,
      role: member.role,
    });
    await storeOtp(`staff_invite:${inviteToken}`, tokenPayload, 86400);

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const setupUrl = `${clientUrl}/${member.tenant.slug}/staff/setup?token=${inviteToken}`;

    await sendStaffInviteEmail({
      email: member.email,
      staffName: member.name || 'Team Member',
      businessName: member.tenant.name,
      inviterName: inviter?.name || 'Your Team Administrator',
      role: member.role,
      setupUrl,
    });

    res.json({
      success: true,
      message: `Invitation email resent to ${member.email}`,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/team/:id — Remove a team member
router.delete('/team/:id', requireRole('ADMIN', 'SUPER_ADMIN'), validateRequest(idParamSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    if (id === req.user!.userId) {
      throw createError(400, 'You cannot remove your own account');
    }

    const member = await prisma.user.findFirst({
      where: { id, tenantId: req.user!.tenantId },
    });

    if (!member) {
      throw createError(404, 'Team member not found');
    }

    await prisma.user.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Team member removed' });
  } catch (err) {
    next(err);
  }
});

export default router;
