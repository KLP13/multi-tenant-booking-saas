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
      // In development / test environment, parse json directly if body is Buffer or string
      event = typeof req.body === 'string' || Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString())
        : req.body;
    }
  } catch (err: any) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const eventType = event.type;
  console.log(`[Stripe Webhook] Processing event: ${eventType}`);

  try {
    switch (eventType) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        const bookingId = paymentIntent.metadata?.bookingId;

        if (!bookingId) {
          console.warn('[Stripe Webhook] payment_intent.succeeded received without bookingId metadata');
          break;
        }

        const existing = await prisma.booking.findUnique({
          where: { id: bookingId },
          include: { resource: true, tenant: true },
        });

        if (!existing) {
          console.error(`[Stripe Webhook] Booking not found for id: ${bookingId}`);
          break;
        }

        // Idempotency check: if already confirmed, skip redundant updates
        if (existing.status === 'CONFIRMED') {
          console.log(`[Stripe Webhook] Booking ${bookingId} already confirmed, skipping redundant processing.`);
          break;
        }

        const updated = await prisma.booking.update({
          where: { id: bookingId },
          data: {
            status: 'CONFIRMED',
            stripePaymentIntentId: paymentIntent.id,
            lockExpiresAt: null,
          },
          include: {
            resource: true,
            tenant: true,
          },
        });

        // Release slot lock from Redis
        const dateStr = updated.startTime.toISOString().split('T')[0];
        const timeStr = updated.startTime.toISOString().split('T')[1].slice(0, 5);
        await releaseLock(updated.resourceId, dateStr, timeStr, bookingId);

        // Send confirmation email
        sendBookingConfirmationEmail({
          booking: updated,
          resource: updated.resource,
          tenant: updated.tenant,
        }).catch((err) => console.error('[Stripe Webhook] Failed to send confirmation email:', err));

        console.log(`[Stripe Webhook] Booking ${bookingId} successfully confirmed via payment_intent.succeeded.`);
        break;
      }

      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled': {
        const paymentIntent = event.data.object;
        const bookingId = paymentIntent.metadata?.bookingId;

        if (!bookingId) break;

        const booking = await prisma.booking.findUnique({
          where: { id: bookingId },
          include: { resource: true, tenant: true },
        });

        if (!booking || booking.status === 'CANCELLED') break;

        const updated = await prisma.booking.update({
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

        const dateStr = updated.startTime.toISOString().split('T')[0];
        const timeStr = updated.startTime.toISOString().split('T')[1].slice(0, 5);
        await releaseLock(updated.resourceId, dateStr, timeStr, bookingId);

        sendBookingCancellationEmail({
          booking: updated,
          resource: updated.resource,
          tenant: updated.tenant,
        }).catch((err) => console.error('[Stripe Webhook] Failed to send cancellation email:', err));

        console.log(`[Stripe Webhook] Booking ${bookingId} status updated to CANCELLED.`);
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${eventType}`);
    }

    return res.json({ received: true });
  } catch (err: any) {
    console.error('[Stripe Webhook] Execution error handling event:', err);
    return res.status(500).json({ error: 'Webhook processing error' });
  }
});

export default router;
