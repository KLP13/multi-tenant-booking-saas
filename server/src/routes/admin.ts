import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { releaseLock } from '../lib/redis';
import { sendBookingCancellationEmail } from '../lib/email';

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
// ─────────────────────────────────────────────────────────────────────────────
router.put('/profile', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, address, phone, logoUrl, cancellationPolicy } = req.body;

    const updated = await prisma.tenant.update({
      where: { id: req.user!.tenantId },
      data: {
        ...(name && { name }),
        ...(address !== undefined && { address }),
        ...(phone !== undefined && { phone }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(cancellationPolicy !== undefined && { cancellationPolicy }),
      },
    });

    res.json({ tenant: updated });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/resources
// List all resources for the authenticated tenant
// ─────────────────────────────────────────────────────────────────────────────
router.get('/resources', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const resources = await prisma.resource.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ resources });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/resources
// Create a new resource with custom schedule
// ─────────────────────────────────────────────────────────────────────────────
router.post('/resources', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
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

    const resource = await prisma.resource.create({
      data: {
        tenantId: req.user!.tenantId,
        name,
        description: description || null,
        hourlyRateCents: Number(hourlyRateCents),
        capacity: Number(capacity) || 1,
        bufferMinutes: Number(bufferMinutes) || 0,
        openTime: openTime || '08:00',
        closeTime: closeTime || '20:00',
        slotDurationMinutes: Number(slotDurationMinutes) || 60,
        operatingDays: operatingDays || 'MON,TUE,WED,THU,FRI,SAT,SUN',
        isActive: true,
      },
    });

    res.status(201).json({ resource });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/resources/:id
// Update a resource
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
router.delete('/resources/:id', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/slots/block', async (req: Request, res: Response, next: NextFunction) => {
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
router.get('/bookings', async (req: Request, res: Response, next: NextFunction) => {
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
router.get('/bookings/export', async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/bookings/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/team', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, role = 'STAFF' } = req.body;

    if (!email || !password) {
      throw createError(400, 'Email and password are required');
    }

    if (!['STAFF', 'ADMIN'].includes(role)) {
      throw createError(400, 'Role must be either STAFF or ADMIN');
    }

    const existing = await prisma.user.findUnique({
      where: {
        tenantId_email: {
          tenantId: req.user!.tenantId,
          email: email.toLowerCase().trim(),
        },
      },
    });

    if (existing) {
      throw createError(409, 'A team member with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const member = await prisma.user.create({
      data: {
        tenantId: req.user!.tenantId,
        email: email.toLowerCase().trim(),
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

    res.status(201).json({ member });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/team/:id — Remove a team member
router.delete('/team/:id', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
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
