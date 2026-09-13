import { validateRequest } from '../middleware/validate';
import {
  createBookingSchema,
  lockSlotSchema,
  lockSlotExtendSchema,
  releaseSlotSchema,
  paymentIntentSchema,
  createIntentAliasSchema,
  upiConfirmSchema,
  razorpayVerifySchema,
  idParamSchema,
} from '../schemas';
import { config } from '../config/env';
import { confirmBookingWithConflictCheck } from '../services/bookingConfirmation';
import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { redis, acquireLock, releaseLock, extendLock, isLocked, getLockedCount, acquireMultiSlotLock, releaseMultiSlotLock, extendMultiSlotLock } from '../lib/redis';
import { stripe } from '../lib/stripe';
import { createError } from '../middleware/errorHandler';
import { sendBookingConfirmationEmail } from '../lib/email';
import { razorpay, verifyRazorpaySignature } from '../lib/razorpay';

const router = Router();

// Fast in-memory cache for resource configs (avoids repetitive 1.2s cloud database roundtrips)
const resourceConfigCache = new Map<string, { resource: any; expiresAt: number }>();

async function getCachedResource(resourceId: string) {
  const cached = resourceConfigCache.get(resourceId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.resource;
  }
  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
  });
  if (resource) {
    resourceConfigCache.set(resourceId, { resource, expiresAt: Date.now() + 60_000 });
  }
  return resource;
}


function getInterveningSlots(startTime: string, endTime: string, slotDurationMinutes: number): string[] {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;
  const slots: string[] = [];
  for (let m = startMins; m < endMins; m += slotDurationMinutes) {
    const hStr = String(Math.floor(m / 60)).padStart(2, '0');
    const mStr = String(m % 60).padStart(2, '0');
    slots.push(`${hStr}:${mStr}`);
  }
  return slots.length > 0 ? slots : [startTime];
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/slots/lock
// -----------------------------------------------------------------------------
// POST /api/bookings/check-availability
// High-precision booking slot conflict and availability engine
// -----------------------------------------------------------------------------
router.post('/bookings/check-availability', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { resourceId, date, startTime, endTime: customEndTime, quantity } = req.body;

    if (!resourceId || !date || !startTime) {
      throw createError(400, 'resourceId, date, and startTime are required');
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) {
      throw createError(400, 'Invalid date (YYYY-MM-DD) or startTime (HH:mm) format');
    }

    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            currency: true,
          },
        },
      },
    });

    if (!resource || !resource.isActive) {
      throw createError(404, 'Resource not found or inactive');
    }

    let finalEndTime = customEndTime;
    if (!finalEndTime) {
      const [sh, sm] = startTime.split(':').map(Number);
      const duration = resource.slotDurationMinutes || 60;
      const totalMinutes = sh * 60 + sm + duration;
      const eh = Math.floor(totalMinutes / 60);
      const em = totalMinutes % 60;
      finalEndTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
    }

    const slotStartDt = new Date(`${date}T${startTime}:00.000Z`);
    const slotEndDt = new Date(`${date}T${finalEndTime}:00.000Z`);

    if (slotEndDt <= slotStartDt) {
      throw createError(400, 'endTime must be after startTime');
    }

    const reqDayIndex = new Date(`${date}T12:00:00.000Z`).getDay();
    const daysMap = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const currentDayCode = daysMap[reqDayIndex];
    const operatingDays = (resource.operatingDays || 'MON,TUE,WED,THU,FRI,SAT,SUN').split(',');

    if (!operatingDays.includes(currentDayCode)) {
      return res.json({
        available: false,
        reason: `Resource is closed on ${currentDayCode}`,
        resourceId,
        date,
        startTime,
        endTime: finalEndTime,
        totalCapacity: resource.capacity,
        remainingCapacity: 0,
      });
    }

    if (startTime < resource.openTime || finalEndTime > resource.closeTime) {
      return res.json({
        available: false,
        reason: `Slot is outside operating hours (${resource.openTime} - ${resource.closeTime})`,
        resourceId,
        date,
        startTime,
        endTime: finalEndTime,
        totalCapacity: resource.capacity,
        remainingCapacity: 0,
      });
    }

    const bufferMs = (resource.bufferMinutes || 0) * 60 * 1000;
    const effectiveStartDt = new Date(slotStartDt.getTime() - bufferMs);
    const effectiveEndDt = new Date(slotEndDt.getTime() + bufferMs);

    const bookedCount = await prisma.booking.count({
      where: {
        resourceId,
        OR: [
        { status: 'CONFIRMED' },
        { status: 'PENDING', lockExpiresAt: { gt: new Date() } },
      ],
        startTime: { lt: effectiveEndDt },
        endTime: { gt: effectiveStartDt },
      },
    });

    const lockedCount = await getLockedCount(resourceId, date, startTime);
    const totalCapacity = resource.capacity || 1;
    const remainingCapacity = Math.max(0, totalCapacity - (bookedCount + lockedCount));
    const requestedQuantity = Math.max(1, Number(quantity) || 1);
    const isSlotAvailable = remainingCapacity >= requestedQuantity;

    res.json({
      available: isSlotAvailable,
      canBook: isSlotAvailable,
      resourceId,
      resourceName: resource.name,
      date,
      startTime,
      endTime: finalEndTime,
      totalCapacity,
      bookedCount,
      lockedCount,
      remainingCapacity,
      requestedQuantity,
      hourlyRateCents: resource.hourlyRateCents,
      currency: resource.tenant?.currency || 'USD',
    });
  } catch (err) {
    next(err);
  }
});

// Places a temporary 10-minute lock on a slot or continuous multi-slot duration in Redis
// -----------------------------------------------------------------------------
router.post('/slots/lock', validateRequest(lockSlotSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { resourceId, date, startTime, endTime: customEndTime, durationMinutes: customDurationMinutes, lockValue } = req.body;

    if (!resourceId || !date || !startTime || !lockValue) {
      throw createError(400, 'resourceId, date, startTime, and lockValue are required');
    }

    // Verify date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) {
      throw createError(400, 'Invalid date (YYYY-MM-DD) or startTime (HH:mm) format');
    }

    const resource = await getCachedResource(resourceId);

    if (!resource || !resource.isActive) {
      throw createError(404, 'Resource not found or inactive');
    }

    const slotDuration = resource.slotDurationMinutes || 60;
    const [startH, startM] = startTime.split(':').map(Number);
    const startTotalMins = startH * 60 + startM;

    // Calculate effective duration and end time
    let effectiveDurationMins = slotDuration;
    if (customDurationMinutes && Number(customDurationMinutes) > 0) {
      effectiveDurationMins = Number(customDurationMinutes);
    } else if (customEndTime) {
      const [endH, endM] = customEndTime.split(':').map(Number);
      const endTotalMins = endH * 60 + endM;
      if (endTotalMins > startTotalMins) {
        effectiveDurationMins = endTotalMins - startTotalMins;
      }
    }

    const endTotalMins = startTotalMins + effectiveDurationMins;
    const computedEndH = Math.floor(endTotalMins / 60);
    const computedEndM = endTotalMins % 60;
    const effectiveEndTime = `${String(computedEndH).padStart(2, '0')}:${String(computedEndM).padStart(2, '0')}`;

    // Operating hours check
    if (startTime < resource.openTime || effectiveEndTime > resource.closeTime) {
      throw createError(400, `Selected time range is outside operating hours (${resource.openTime} - ${resource.closeTime})`);
    }

    // Get all individual slots in this contiguous span
    const slotTimes = getInterveningSlots(startTime, effectiveEndTime, slotDuration);

    const fullStartDt = new Date(`${date}T${startTime}:00.000Z`);
    const fullEndDt = new Date(`${date}T${effectiveEndTime}:00.000Z`);

    // Ensure entire span is not in the past
    if (fullEndDt.getTime() < Date.now() - 60 * 1000) {
      throw createError(400, 'Cannot hold or book a time slot that has already concluded');
    }

    const totalCapacity = resource.capacity || 1;
    const availableCapacities: Record<string, number> = {};

    // Validate availability for all slots in the span with ONE single database query
    const overlappingBookings = await prisma.booking.findMany({
      where: {
        resourceId,
        OR: [
          { status: 'CONFIRMED' },
          { status: 'PENDING', lockExpiresAt: { gt: new Date() } },
        ],
        startTime: { lt: fullEndDt },
        endTime: { gt: fullStartDt },
      },
      select: {
        startTime: true,
        endTime: true,
      },
    });
    
    for (const sTime of slotTimes) {
      const [sh, sm] = sTime.split(':').map(Number);
      const slotEndTotal = sh * 60 + sm + slotDuration;
      const sEndTime = `${String(Math.floor(slotEndTotal / 60)).padStart(2, '0')}:${String(slotEndTotal % 60).padStart(2, '0')}`;
      const sStartDt = new Date(`${date}T${sTime}:00.000Z`);
      const sEndDt = new Date(`${date}T${sEndTime}:00.000Z`);

      const bookedCount = overlappingBookings.filter(
        (b) => b.startTime < sEndDt && b.endTime > sStartDt
      ).length;

      const avail = totalCapacity - bookedCount;
      if (avail <= 0) {
        throw createError(409, `Slot ${sTime} - ${sEndTime} is already fully booked`);
      }
      availableCapacities[sTime] = avail;
    }

    // Atomically acquire locks across all slots in the span
    const acquired = await acquireMultiSlotLock(resourceId, date, slotTimes, lockValue, availableCapacities);
    
    if (!acquired) {
      throw createError(409, 'One or more slots in the selected duration are currently being held at checkout');
    }

        res.json({
      success: true,
      message: `Reserved ${slotTimes.length} slot(s) for 10 minutes`,
      lockValue,
      resourceId,
      date,
      startTime,
      endTime: effectiveEndTime,
      durationMinutes: effectiveDurationMins,
      slotCount: slotTimes.length,
      slotTimes,
      expiresInSeconds: 600,
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// POST /api/slots/lock/extend
// Extends an active Redis reservation hold for user currently completing checkout
// -----------------------------------------------------------------------------
router.post('/slots/lock/extend', validateRequest(lockSlotExtendSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { resourceId, date, startTime, endTime, durationMinutes, lockValue, extendSeconds } = req.body;

    if (!resourceId || !startTime || !lockValue) {
      throw createError(400, 'resourceId, startTime, and lockValue are required');
    }

    let slotTimes = [startTime];
    if (date && (endTime || durationMinutes)) {
      const resource = await prisma.resource.findUnique({
        where: { id: resourceId },
        select: { slotDurationMinutes: true },
      });
      const slotDuration = resource?.slotDurationMinutes || 60;
      let effectiveEndTime = endTime;
      if (!effectiveEndTime && durationMinutes) {
        const [sh, sm] = startTime.split(':').map(Number);
        const endTotal = sh * 60 + sm + Number(durationMinutes);
        effectiveEndTime = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;
      }
      if (effectiveEndTime) {
        slotTimes = getInterveningSlots(startTime, effectiveEndTime, slotDuration);
      }
    }

    const ttl = Math.min(Number(extendSeconds) || 600, 1800); // max 30 min
    const extended = date
      ? await extendMultiSlotLock(resourceId, date, slotTimes, lockValue, ttl)
      : await extendLock(resourceId, '', startTime, lockValue, ttl);

    if (!extended) {
      throw createError(404, 'Active lock expired or does not exist');
    }

    res.json({
      success: true,
      message: `Lock extended for ${ttl} seconds across ${slotTimes.length} slot(s)`,
      lockValue,
      expiresInSeconds: ttl,
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// DELETE /api/slots/lock
// Release a previously acquired lock across single or multiple slots
// -----------------------------------------------------------------------------
router.delete('/slots/lock', validateRequest(releaseSlotSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { resourceId, date, startTime, endTime, durationMinutes, lockValue } = req.body;

    if (!resourceId || !date || !startTime || !lockValue) {
      throw createError(400, 'resourceId, date, startTime, and lockValue are required');
    }

    let slotTimes = [startTime];
    if (endTime || durationMinutes) {
      const resource = await prisma.resource.findUnique({
        where: { id: resourceId },
        select: { slotDurationMinutes: true },
      });
      const slotDuration = resource?.slotDurationMinutes || 60;
      let effectiveEndTime = endTime;
      if (!effectiveEndTime && durationMinutes) {
        const [sh, sm] = startTime.split(':').map(Number);
        const endTotal = sh * 60 + sm + Number(durationMinutes);
        effectiveEndTime = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;
      }
      if (effectiveEndTime) {
        slotTimes = getInterveningSlots(startTime, effectiveEndTime, slotDuration);
      }
    }

    const released = await releaseMultiSlotLock(resourceId, date, slotTimes, lockValue);

    res.json({ success: true, released, releasedSlots: slotTimes });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bookings
// Create a PENDING booking record
// ─────────────────────────────────────────────────────────────────────────────
router.post('/bookings', validateRequest(createBookingSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      resourceId,
      customerName,
      customerEmail,
      startTime,
      endTime,
      lockValue,
      tenantId,
      tenantSlug,
    } = req.body;

    if (!resourceId || !customerName || !customerEmail || !startTime || !endTime) {
      throw createError(400, 'All booking fields are required');
    }

    // 1. Idempotency Key Handling (retry-safe)
    const idempotencyKey = (req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || req.body.idempotencyKey) as string | undefined;
    if (idempotencyKey && redis) {
      const cleanKey = `idempotency:booking:${idempotencyKey.trim()}`;
      try {
        const cached = await redis.get(cleanKey);
        if (cached) {
          return res.status(200).json({
            ...JSON.parse(cached),
            idempotent: true,
          });
        }
      } catch {}
    }

    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
      include: { tenant: true },
    });

    if (!resource || !resource.isActive) {
      throw createError(404, 'Resource not found or is currently inactive');
    }

    // 2. Validate resource belongs to requested tenant
    const requestedTenant = (tenantId || tenantSlug || req.query.tenantId || req.query.tenantSlug) as string | undefined;
    if (requestedTenant) {
      if (resource.tenantId !== requestedTenant && resource.tenant?.slug !== requestedTenant) {
        throw createError(403, 'Requested resource does not belong to the specified business workspace');
      }
    }

    // 3. Validate startTime < endTime
    const startDt = new Date(startTime);
    const endDt = new Date(endTime);

    if (isNaN(startDt.getTime()) || isNaN(endDt.getTime())) {
      throw createError(400, 'Invalid startTime or endTime format');
    }

    if (startDt >= endDt) {
      throw createError(400, 'startTime must be strictly before endTime');
    }

    // 4. Validate booking is not in the past (with 60s clock grace)
    const now = new Date();
    if (startDt.getTime() < now.getTime() - 60 * 1000) {
      throw createError(400, 'Cannot book a time slot in the past. Please choose an upcoming slot.');
    }

    // 5. Validate slot duration alignment
    const slotDurationMinutes = resource.slotDurationMinutes || 60;
    const durationMinutes = (endDt.getTime() - startDt.getTime()) / (60 * 1000);
    if (durationMinutes <= 0 || !Number.isInteger(durationMinutes)) {
      throw createError(400, 'Booking duration must be a positive integer number of minutes');
    }

    if (durationMinutes % slotDurationMinutes !== 0) {
      throw createError(
        400,
        `Booking duration (${durationMinutes} mins) must align with resource slot duration of ${slotDurationMinutes} minutes`
      );
    }

    // Calculate total amount
    const durationHours = Math.max(1, Math.round(durationMinutes / 60));
    const totalAmountCents = durationHours * resource.hourlyRateCents;

    // 6. Check overlapping bookings against capacity
    // False conflicts avoided: CANCELLED bookings and expired PENDING bookings are strictly excluded!
    const bookedCount = await prisma.booking.count({
      where: {
        resourceId,
        OR: [
          { status: 'CONFIRMED' },
          { status: 'PENDING', lockExpiresAt: { gt: new Date() } },
        ],
        startTime: { lt: endDt },
        endTime: { gt: startDt },
      },
    });

    const totalCapacity = resource.capacity || 1;
    if (bookedCount >= totalCapacity) {
      throw createError(409, 'All spots for this time slot are already booked');
    }

    const lockExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes temporary hold

    const booking = await prisma.booking.create({
      data: {
        tenantId: resource.tenantId,
        resourceId,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim().toLowerCase(),
        startTime: startDt,
        endTime: endDt,
        status: 'PENDING',
        totalAmountCents,
        lockExpiresAt,
      },
      include: {
        resource: { select: { name: true, hourlyRateCents: true } },
        tenant: { select: { name: true, currency: true, slug: true } },
      },
    });

    // Cache idempotency response if key provided
    if (idempotencyKey && redis) {
      try {
        await redis.set(`idempotency:booking:${idempotencyKey.trim()}`, JSON.stringify({ booking }), 'EX', 86400);
      } catch {}
    }

    res.status(201).json({ booking });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bookings/:id/payment-intent
// Create a Stripe PaymentIntent for the booking
// ─────────────────────────────────────────────────────────────────────────────
router.post('/bookings/:id/payment-intent', validateRequest(paymentIntentSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const idempotencyKey = (req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || req.body.idempotencyKey) as string | undefined;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        resource: true,
        tenant: true,
      },
    });

    if (!booking) {
      throw createError(404, 'Booking not found');
    }

    if (booking.status === 'CONFIRMED') {
      throw createError(400, 'Booking is already confirmed');
    }

    if (booking.status === 'CANCELLED') {
      throw createError(400, 'Booking has been cancelled');
    }

    // Retry-safe: If payment intent already exists for this booking, return it idempotently
    if (booking.stripePaymentIntentId) {
      if (booking.stripePaymentIntentId.startsWith('pi_mock_')) {
        return res.json({
          clientSecret: `${booking.stripePaymentIntentId}_secret_mock`,
          paymentIntentId: booking.stripePaymentIntentId,
          amount: booking.totalAmountCents,
          currency: booking.tenant.currency.toLowerCase(),
          isMock: true,
          idempotent: true,
        });
      } else if (config.payments.stripe.isConfigured) {
        try {
          const existingIntent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
          return res.json({
            clientSecret: existingIntent.client_secret,
            paymentIntentId: existingIntent.id,
            amount: booking.totalAmountCents,
            currency: booking.tenant.currency.toLowerCase(),
            isMock: false,
            idempotent: true,
          });
        } catch (err: any) {
          console.warn('[Stripe] Could not retrieve existing intent, creating new:', err.message);
        }
      }
    }

    // Check if Stripe is configured
    if (!config.payments.stripe.isConfigured) {
      const mockIntentId = `pi_mock_${booking.id.replace(/-/g, '').slice(0, 16)}`;
      const mockClientSecret = `${mockIntentId}_secret_mock`;

      await prisma.booking.update({
        where: { id },
        data: { stripePaymentIntentId: mockIntentId },
      });

      return res.json({
        clientSecret: mockClientSecret,
        paymentIntentId: mockIntentId,
        amount: booking.totalAmountCents,
        currency: booking.tenant.currency.toLowerCase(),
        isMock: true,
      });
    }

    // Real Stripe PaymentIntent with native Stripe idempotency key
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: booking.totalAmountCents,
        currency: booking.tenant.currency.toLowerCase(),
        metadata: {
          bookingId: booking.id,
          tenantId: booking.tenantId,
          resourceId: booking.resourceId,
        },
        receipt_email: booking.customerEmail,
        description: `Booking for ${booking.resource.name} (${booking.tenant.name})`,
      },
      {
        idempotencyKey: idempotencyKey ? `pi_${idempotencyKey.trim()}` : `pi_booking_${booking.id}`,
      }
    );

    await prisma.booking.update({
      where: { id },
      data: { stripePaymentIntentId: paymentIntent.id },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: booking.totalAmountCents,
      currency: booking.tenant.currency.toLowerCase(),
      isMock: false,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bookings/:id/confirm-test
// Endpoint for testing/confirming booking without Stripe webhook in dev
// ─────────────────────────────────────────────────────────────────────────────

// -----------------------------------------------------------------------------
// POST /api/payments/create-intent
// Standardized alias route for creating Stripe PaymentIntents by bookingId
// -----------------------------------------------------------------------------
router.post('/payments/create-intent', validateRequest(createIntentAliasSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) {
      throw createError(400, 'bookingId is required in request body');
    }
    // Forward internally to parameter handler logic
    req.params.id = bookingId;
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { resource: true, tenant: true },
    });

    if (!booking) throw createError(404, 'Booking not found');
    if (booking.status === 'CONFIRMED') throw createError(400, 'Booking is already confirmed');
    if (booking.status === 'CANCELLED') throw createError(400, 'Booking has been cancelled');

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || stripeKey === 'sk_test_placeholder') {
      const mockIntentId = `pi_mock_${booking.id.replace(/-/g, '').slice(0, 16)}`;
      const mockClientSecret = `${mockIntentId}_secret_mock`;
      await prisma.booking.update({
        where: { id: bookingId },
        data: { stripePaymentIntentId: mockIntentId },
      });
      return res.json({
        clientSecret: mockClientSecret,
        paymentIntentId: mockIntentId,
        amount: booking.totalAmountCents,
        currency: booking.tenant.currency.toLowerCase(),
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder',
        isMock: true,
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: booking.totalAmountCents,
      currency: booking.tenant.currency.toLowerCase(),
      metadata: {
        bookingId: booking.id,
        tenantId: booking.tenantId,
        resourceId: booking.resourceId,
      },
      receipt_email: booking.customerEmail,
      description: `Booking for ${booking.resource.name} (${booking.tenant.name})`,
    });

    await prisma.booking.update({
      where: { id: bookingId },
      data: { stripePaymentIntentId: paymentIntent.id },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: booking.totalAmountCents,
      currency: booking.tenant.currency.toLowerCase(),
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder',
      isMock: false,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/bookings/:id/confirm-test', validateRequest(idParamSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { booking, alreadyConfirmed } = await confirmBookingWithConflictCheck({
      bookingId: id,
      paymentMethod: 'TEST',
    });
    res.json({ success: true, booking, alreadyConfirmed });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bookings/:id/upi/confirm
// Confirms booking paid via UPI QR / VPA
// ─────────────────────────────────────────────────────────────────────────────
router.post('/bookings/:id/upi/confirm', validateRequest(upiConfirmSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { upiId, upiApp, utr } = req.body;

    // Cryptographically secure UPI reference or supplied UTR
    const upiRef = utr?.trim() || `upi_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;

    const { booking, alreadyConfirmed } = await confirmBookingWithConflictCheck({
      bookingId: id,
      paymentMethod: 'UPI',
      razorpayPaymentId: upiRef,
    });

    res.json({
      success: true,
      message: alreadyConfirmed
        ? 'Reservation is already confirmed'
        : `Payment of ₹${(booking.totalAmountCents / 100).toFixed(2)} received via UPI (${upiId || 'QR'})`,
      booking,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/bookings/:id
// Get booking details (for confirmation page)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/bookings/:id', validateRequest(idParamSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const booking = await prisma.booking.findUnique({
      where: { id },
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
          },
        },
      },
    });

    if (!booking) {
      throw createError(404, 'Booking not found');
    }

    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bookings/:id/razorpay/create-order
// Creates a Razorpay order in INR paise
// ─────────────────────────────────────────────────────────────────────────────
router.post('/bookings/:id/razorpay/create-order', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        resource: true,
        tenant: true,
      },
    });

    if (!booking) {
      throw createError(404, 'Booking not found');
    }

    if (booking.status === 'CONFIRMED') {
      throw createError(400, 'Booking is already confirmed');
    }

    if (booking.status === 'CANCELLED') {
      throw createError(400, 'Booking has been cancelled');
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw createError(500, 'Razorpay keys are not configured on the server');
    }

    // Razorpay amount is in paise (1 INR = 100 paise)
    const amountInPaise = booking.totalAmountCents;
    const receipt = `rcpt_${booking.id.replace(/-/g, '').slice(0, 20)}`;

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt,
      notes: {
        bookingId: booking.id,
        tenantId: booking.tenantId,
        resourceName: booking.resource.name,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
      },
    });

    await prisma.booking.update({
      where: { id },
      data: { razorpayOrderId: order.id },
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
      booking: {
        id: booking.id,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        resourceName: booking.resource.name,
        tenantName: booking.tenant.name,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bookings/:id/razorpay/verify
// Verifies HMAC SHA-256 signature and confirms reservation
// ─────────────────────────────────────────────────────────────────────────────
router.post('/bookings/:id/razorpay/verify', validateRequest(razorpayVerifySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw createError(400, 'razorpay_order_id, razorpay_payment_id, and razorpay_signature are required');
    }

    // Verify cryptographic HMAC signature
    const isValid = verifyRazorpaySignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    if (!isValid) {
      throw createError(400, 'Invalid Razorpay payment signature');
    }

    const { booking, alreadyConfirmed } = await confirmBookingWithConflictCheck({
      bookingId: id,
      paymentMethod: 'RAZORPAY',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });

    res.json({
      success: true,
      message: alreadyConfirmed ? 'Reservation is already verified' : 'Payment verified and reservation confirmed!',
      booking,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
