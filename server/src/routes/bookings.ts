import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { acquireLock, releaseLock, isLocked } from '../lib/redis';
import { stripe } from '../lib/stripe';
import { createError } from '../middleware/errorHandler';
import { sendBookingConfirmationEmail } from '../lib/email';
import { razorpay, verifyRazorpaySignature } from '../lib/razorpay';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/slots/lock
// Places a temporary 10-minute lock on a slot in Redis
// ─────────────────────────────────────────────────────────────────────────────
router.post('/slots/lock', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { resourceId, date, startTime, lockValue } = req.body;

    if (!resourceId || !date || !startTime || !lockValue) {
      throw createError(400, 'resourceId, date, startTime, and lockValue are required');
    }

    // Verify date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) {
      throw createError(400, 'Invalid date (YYYY-MM-DD) or startTime (HH:mm) format');
    }

    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
    });

    if (!resource || !resource.isActive) {
      throw createError(404, 'Resource not found or inactive');
    }

    // Check if booked in DB against resource capacity
    const startHour = parseInt(startTime.split(':')[0], 10);
    const endHour = startHour + 1;
    const endTime = `${String(endHour).padStart(2, '0')}:00`;

    const slotStartDt = new Date(`${date}T${startTime}:00.000Z`);
    const slotEndDt = new Date(`${date}T${endTime}:00.000Z`);

    // Ensure slot is not in the past
    if (slotEndDt.getTime() < Date.now() - 15 * 60 * 1000) {
      throw createError(400, 'Cannot hold or book a time slot that has already concluded');
    }

    const bookedCount = await prisma.booking.count({
      where: {
        resourceId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startTime: { lt: slotEndDt },
        endTime: { gt: slotStartDt },
      },
    });

    const totalCapacity = resource.capacity || 1;
    const availableCapacity = totalCapacity - bookedCount;

    if (availableCapacity <= 0) {
      throw createError(409, 'All spots for this time slot are already booked');
    }

    // Try acquiring Redis / in-memory lock respecting available capacity
    const acquired = await acquireLock(resourceId, date, startTime, lockValue, availableCapacity);

    if (!acquired) {
      throw createError(409, 'All available units for this slot are currently being held at checkout');
    }

    res.json({
      success: true,
      message: 'Slot locked for 10 minutes',
      lockValue,
      resourceId,
      date,
      startTime,
      endTime,
      expiresInSeconds: 600,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/slots/lock
// Release a previously acquired lock
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/slots/lock', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { resourceId, date, startTime, lockValue } = req.body;

    if (!resourceId || !date || !startTime || !lockValue) {
      throw createError(400, 'resourceId, date, startTime, and lockValue are required');
    }

    const released = await releaseLock(resourceId, date, startTime, lockValue);

    res.json({ success: released });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bookings
// Create a PENDING booking record
// ─────────────────────────────────────────────────────────────────────────────
router.post('/bookings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      resourceId,
      customerName,
      customerEmail,
      startTime,
      endTime,
      lockValue,
    } = req.body;

    if (!resourceId || !customerName || !customerEmail || !startTime || !endTime) {
      throw createError(400, 'All booking fields are required');
    }

    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
      include: { tenant: true },
    });

    if (!resource || !resource.isActive) {
      throw createError(404, 'Resource not found');
    }

    const startDt = new Date(startTime);
    const endDt = new Date(endTime);

    if (isNaN(startDt.getTime()) || isNaN(endDt.getTime()) || startDt >= endDt) {
      throw createError(400, 'Invalid startTime or endTime');
    }

    // Calculate duration in hours
    const durationHours = Math.max(1, Math.round((endDt.getTime() - startDt.getTime()) / (1000 * 60 * 60)));
    const totalAmountCents = durationHours * resource.hourlyRateCents;

    // Check overlapping bookings against capacity
    const bookedCount = await prisma.booking.count({
      where: {
        resourceId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startTime: { lt: endDt },
        endTime: { gt: startDt },
      },
    });

    const totalCapacity = resource.capacity || 1;
    if (bookedCount >= totalCapacity) {
      throw createError(409, 'All spots for this time slot are already booked');
    }


    const lockExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const booking = await prisma.booking.create({
      data: {
        tenantId: resource.tenantId,
        resourceId,
        customerName,
        customerEmail,
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

    res.status(201).json({ booking });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bookings/:id/payment-intent
// Create a Stripe PaymentIntent for the booking
// ─────────────────────────────────────────────────────────────────────────────
router.post('/bookings/:id/payment-intent', async (req: Request, res: Response, next: NextFunction) => {
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

    // Check if Stripe is configured
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || stripeKey === 'sk_test_placeholder') {
      // Mock payment intent for local testing
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

    // Real Stripe PaymentIntent
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
router.post('/bookings/:id/confirm-test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const booking = await prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      throw createError(404, 'Booking not found');
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        lockExpiresAt: null,
      },
      include: {
        resource: true,
        tenant: true,
      },
    });

    // Release Redis lock if any
    const dateStr = booking.startTime.toISOString().split('T')[0];
    const timeStr = booking.startTime.toISOString().split('T')[1].slice(0, 5);
    // Best effort release
    await releaseLock(booking.resourceId, dateStr, timeStr, id);

    // Send confirmation email with iCalendar invite
    sendBookingConfirmationEmail({
      booking: updated,
      resource: updated.resource,
      tenant: updated.tenant,
    }).catch((err) => console.error('Failed to send booking confirmation email:', err));

    res.json({ success: true, booking: updated });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bookings/:id/upi/confirm
// Confirms booking paid via UPI QR / VPA
// ─────────────────────────────────────────────────────────────────────────────
router.post('/bookings/:id/upi/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { upiId } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      throw createError(404, 'Booking not found');
    }

    const upiRef = `upi_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        razorpayPaymentId: upiRef,
        lockExpiresAt: null,
      },
      include: {
        resource: true,
        tenant: true,
      },
    });

    // Release Redis lock if any
    const dateStr = booking.startTime.toISOString().split('T')[0];
    const timeStr = booking.startTime.toISOString().split('T')[1].slice(0, 5);
    await releaseLock(booking.resourceId, dateStr, timeStr, id);

    // Send confirmation email with Google Calendar link
    sendBookingConfirmationEmail({
      booking: updated,
      resource: updated.resource,
      tenant: updated.tenant,
    }).catch((err) => console.error('Failed to send UPI booking confirmation email:', err));

    res.json({
      success: true,
      message: `Payment of ₹${(updated.totalAmountCents / 100).toFixed(2)} received via UPI (${upiId || 'QR'})`,
      booking: updated,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/bookings/:id
// Get booking details (for confirmation page)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/bookings/:id', async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/bookings/:id/razorpay/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw createError(400, 'razorpay_order_id, razorpay_payment_id, and razorpay_signature are required');
    }

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

    // Verify cryptographic HMAC signature
    const isValid = verifyRazorpaySignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    if (!isValid) {
      throw createError(400, 'Invalid Razorpay payment signature');
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        razorpayPaymentId: razorpay_payment_id,
        lockExpiresAt: null,
      },
      include: {
        resource: true,
        tenant: true,
      },
    });

    // Release Redis lock if any
    const dateStr = booking.startTime.toISOString().split('T')[0];
    const timeStr = booking.startTime.toISOString().split('T')[1].slice(0, 5);
    await releaseLock(booking.resourceId, dateStr, timeStr, id);

    // Send confirmation email with .ics calendar invite
    sendBookingConfirmationEmail({
      booking: updated,
      resource: updated.resource,
      tenant: updated.tenant,
    }).catch((err) => console.error('Failed to send confirmation email on Razorpay payment:', err));

    res.json({
      success: true,
      message: 'Payment verified and reservation confirmed!',
      booking: updated,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
