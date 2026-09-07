import { Router, Request, Response } from 'express';
import { stripe } from '../lib/stripe';
import { prisma } from '../lib/prisma';
import { releaseLock } from '../lib/redis';
import { sendBookingConfirmationEmail, sendBookingCancellationEmail } from '../lib/email';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: any;

  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // In dev mode without secret, parse json directly if body is Buffer or JSON
      event = typeof req.body === 'string' || Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString())
        : req.body;
    }
  } catch (err: any) {
    console.error(`⚠️ Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;
      const bookingId = paymentIntent.metadata?.bookingId;

      if (bookingId) {
        const booking = await prisma.booking.update({
          where: { id: bookingId },
          data: {
            status: 'CONFIRMED',
            lockExpiresAt: null,
          },
          include: {
            resource: true,
            tenant: true,
          },
        });

        // Release slot lock from Redis
        const dateStr = booking.startTime.toISOString().split('T')[0];
        const timeStr = booking.startTime.toISOString().split('T')[1].slice(0, 5);
        await releaseLock(booking.resourceId, dateStr, timeStr, booking.id);

        // Send booking confirmation email with .ics calendar invite
        sendBookingConfirmationEmail({
          booking,
          resource: booking.resource,
          tenant: booking.tenant,
        }).catch((err) => console.error('Failed to send confirmation email via webhook:', err));

        console.log(`✅ Booking ${bookingId} confirmed via Stripe webhook!`);
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object;
      const bookingId = paymentIntent.metadata?.bookingId;

      if (bookingId) {
        const booking = await prisma.booking.update({
          where: { id: bookingId },
          data: {
            status: 'CANCELLED',
            lockExpiresAt: null,
          },
          include: {
            resource: true,
            tenant: true,
          },
        });

        const dateStr = booking.startTime.toISOString().split('T')[0];
        const timeStr = booking.startTime.toISOString().split('T')[1].slice(0, 5);
        await releaseLock(booking.resourceId, dateStr, timeStr, booking.id);

        sendBookingCancellationEmail({
          booking,
          resource: booking.resource,
          tenant: booking.tenant,
        }).catch((err) => console.error('Failed to send cancellation email via webhook:', err));

        console.log(`❌ Booking ${bookingId} cancelled due to payment failure.`);
      }
      break;
    }

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

export default router;
