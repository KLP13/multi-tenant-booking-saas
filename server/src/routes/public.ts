import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { isLocked, getLockedCount, releaseLock } from '../lib/redis';
import { sendBookingCancellationEmail } from '../lib/email';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tenants/:slug/resources
// Public — list all active resources for a tenant with business profile
// ─────────────────────────────────────────────────────────────────────────────
router.get('/tenants/:slug/resources', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = req.params.slug as string;

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
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
    });

    if (!tenant) {
      throw createError(404, 'Business not found');
    }

    const resources = await prisma.resource.findMany({
      where: { tenantId: tenant.id, isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        capacity: true,
        hourlyRateCents: true,
        bufferMinutes: true,
        openTime: true,
        closeTime: true,
        slotDurationMinutes: true,
        operatingDays: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json({ tenant, resources });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/resources/:id/slots?date=YYYY-MM-DD
// Public — return time slots according to resource's custom operating schedule
// ─────────────────────────────────────────────────────────────────────────────
router.get('/resources/:id/slots', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { date } = req.query;

    if (!date || typeof date !== 'string') {
      throw createError(400, 'Query param ?date=YYYY-MM-DD is required');
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      throw createError(400, 'Invalid date format. Use YYYY-MM-DD');
    }

    const resource = await prisma.resource.findUnique({
      where: { id },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            currency: true,
            logoUrl: true,
            cancellationPolicy: true,
          },
        },
      },
    });

    if (!resource || !resource.isActive) {
      throw createError(404, 'Resource not found or inactive');
    }

    // Day of week check (MON, TUE, WED, THU, FRI, SAT, SUN)
    const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const dayCode = DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
    const allowedDays = (resource.operatingDays || 'MON,TUE,WED,THU,FRI,SAT,SUN')
      .split(',')
      .map(d => d.trim().toUpperCase());

    if (!allowedDays.includes(dayCode)) {
      return res.json({
        resource: {
          id: resource.id,
          name: resource.name,
          description: resource.description,
          capacity: resource.capacity,
          hourlyRateCents: resource.hourlyRateCents,
          openTime: resource.openTime,
          closeTime: resource.closeTime,
          slotDurationMinutes: resource.slotDurationMinutes,
          operatingDays: resource.operatingDays,
          tenant: resource.tenant,
        },
        date,
        isClosed: true,
        message: `Closed on ${dayCode === 'SUN' ? 'Sundays' : dayCode === 'MON' ? 'Mondays' : dayCode + 's'}`,
        slots: [],
      });
    }

    // Parse resource operating schedule (e.g. "08:00" to "20:00")
    const openTimeStr = resource.openTime || '08:00';
    const closeTimeStr = resource.closeTime || '20:00';
    const slotDuration = resource.slotDurationMinutes || 60;

    const [openH, openM] = openTimeStr.split(':').map(Number);
    const [closeH, closeM] = closeTimeStr.split(':').map(Number);

    const startMinutes = (openH || 8) * 60 + (openM || 0);
    const endMinutes = (closeH || 20) * 60 + (closeM || 0);

    const totalCapacity = resource.capacity || 1;
    const slots: {
      startTime: string;
      endTime: string;
      status: string;
      remainingCapacity: number;
      totalCapacity: number;
      reason?: string;
    }[] = [];

    let current = startMinutes;
    while (current + slotDuration <= endMinutes) {
      const startHStr = String(Math.floor(current / 60)).padStart(2, '0');
      const startMStr = String(current % 60).padStart(2, '0');
      const endHStr = String(Math.floor((current + slotDuration) / 60)).padStart(2, '0');
      const endMStr = String((current + slotDuration) % 60).padStart(2, '0');

      const slotStart = `${startHStr}:${startMStr}`;
      const slotEnd = `${endHStr}:${endMStr}`;

      const slotStartDt = new Date(`${date}T${slotStart}:00.000Z`);
      const slotEndDt = new Date(`${date}T${slotEnd}:00.000Z`);

      // Check database bookings (confirmed, pending, or manual block holds)
      const existingBookings = await prisma.booking.findMany({
        where: {
          resourceId: id,
          status: { in: ['PENDING', 'CONFIRMED'] },
          startTime: { lt: slotEndDt },
          endTime: { gt: slotStartDt },
        },
        select: { status: true, customerName: true },
      });

      // Check if admin placed a manual maintenance block
      const maintenanceBlock = existingBookings.find((b) => b.customerName.startsWith('[BLOCKED]'));

      let status = 'available';
      let reason: string | undefined = undefined;

      if (maintenanceBlock) {
        status = 'blocked';
        reason = maintenanceBlock.customerName.replace('[BLOCKED]', '').trim() || 'Maintenance / Private Hold';
      }

      // Count active bookings and active Redis locks
      const bookedCount = existingBookings.length;
      const lockedCount = await getLockedCount(id, date, slotStart);
      const remainingCapacity = Math.max(0, totalCapacity - bookedCount - lockedCount);

      if (status !== 'blocked') {
        if (bookedCount >= totalCapacity) {
          status = 'booked';
        } else if (remainingCapacity === 0) {
          status = 'locked';
        } else {
          status = 'available';
        }
      }

      slots.push({
        startTime: slotStart,
        endTime: slotEnd,
        status,
        remainingCapacity,
        totalCapacity,
        reason,
      });
      current += slotDuration;
    }


    res.json({
      resource: {
        id: resource.id,
        name: resource.name,
        description: resource.description,
        capacity: resource.capacity,
        hourlyRateCents: resource.hourlyRateCents,
        openTime: resource.openTime,
        closeTime: resource.closeTime,
        slotDurationMinutes: resource.slotDurationMinutes,
        operatingDays: resource.operatingDays,
        tenant: resource.tenant,
      },
      date,
      isClosed: false,
      slots,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tenants/:slug/customer/bookings?email=...
// Returns all bookings for a customer under this tenant
// ─────────────────────────────────────────────────────────────────────────────
router.get('/tenants/:slug/customer/bookings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = req.params.slug as string;
    const email = (req.query.email as string || '').trim().toLowerCase();

    if (!email) {
      throw createError(400, 'Customer email is required to view bookings');
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true, currency: true, cancellationPolicy: true },
    });

    if (!tenant) {
      throw createError(404, 'Business not found');
    }

    const bookings = await prisma.booking.findMany({
      where: {
        tenantId: tenant.id,
        customerEmail: {
          equals: email,
          mode: 'insensitive',
        },
      },
      include: {
        resource: {
          select: {
            id: true,
            name: true,
            description: true,
            hourlyRateCents: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            currency: true,
            cancellationPolicy: true,
          },
        },
      },
      orderBy: {
        startTime: 'desc',
      },
    });

    res.json({ bookings, tenant });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/tenants/:slug/customer/bookings/:id/cancel
// Allows customer to cancel their booking
// ─────────────────────────────────────────────────────────────────────────────
router.post('/tenants/:slug/customer/bookings/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = req.params.slug as string;
    const id = req.params.id as string;
    const email = (req.body.email as string || '').trim().toLowerCase();

    if (!email) {
      throw createError(400, 'Customer email is required to cancel reservation');
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!tenant) {
      throw createError(404, 'Business not found');
    }

    const booking = await prisma.booking.findFirst({
      where: {
        id,
        tenantId: tenant.id,
      },
      include: {
        resource: true,
      },
    });

    if (!booking) {
      throw createError(404, 'Booking not found');
    }

    if (booking.customerEmail.toLowerCase() !== email) {
      throw createError(403, 'You are not authorized to cancel this booking');
    }

    if (booking.status === 'CANCELLED') {
      throw createError(400, 'Booking is already cancelled');
    }

    if (new Date(booking.endTime) < new Date()) {
      throw createError(400, 'Cannot cancel a booking that has already passed');
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        lockExpiresAt: null,
      },
      include: {
        resource: {
          select: { id: true, name: true, description: true, hourlyRateCents: true },
        },
        tenant: {
          select: { id: true, name: true, slug: true, currency: true },
        },
      },
    });

    // Release Redis lock if any
    const dateStr = booking.startTime.toISOString().split('T')[0];
    const timeStr = booking.startTime.toISOString().split('T')[1].slice(0, 5);
    await releaseLock(booking.resourceId, dateStr, timeStr, booking.id);

    // Send cancellation email
    sendBookingCancellationEmail({
      booking: updated,
      resource: updated.resource,
      tenant: updated.tenant,
    }).catch((err) => console.error('Failed to send customer cancellation email:', err));

    res.json({
      success: true,
      message: 'Reservation cancelled successfully',
      booking: updated,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

