import { logger } from '../lib/logger';
import { Router, Request, Response } from 'express';
import { stripe } from '../lib/stripe';
import { prisma } from '../lib/prisma';
import { releaseLock } from '../lib/redis';
import { sendBookingCancellationEmail } from '../lib/email';
import { confirmBookingWithConflictCheck } from '../services/bookingConfirmation';
import { config } from '../config/env';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = config.payments.stripe.webhookSecret;

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
    logger.error({ err }, '[Stripe Webhook] Signature verification failed: ' + err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const eventType = event.type;
  logger.info({ eventType }, `[Stripe Webhook] Processing event: ${eventType}`);

  try {
    switch (eventType) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        const bookingId = paymentIntent.metadata?.bookingId;

        if (!bookingId) {
          logger.warn('[Stripe Webhook] payment_intent.succeeded received without bookingId metadata');
          break;
        }

        try {
          const result = await confirmBookingWithConflictCheck({
            bookingId,
            paymentMethod: 'STRIPE',
            stripePaymentIntentId: paymentIntent.id,
          });

          if (result.alreadyConfirmed) {
            logger.info({ bookingId }, `[Stripe Webhook] Booking ${bookingId} already confirmed, skipping duplicate.`);
          } else {
            logger.info({ bookingId }, `[Stripe Webhook] Booking ${bookingId} successfully confirmed.`);
          }
        } catch (err: any) {
          logger.error({ bookingId, err }, `[Stripe Webhook] Capacity conflict or error confirming booking ${bookingId}: ` + err.message);
        }
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
        }).catch((err) => logger.error({ err }, '[Stripe Webhook] Failed to send cancellation email'));

        logger.info({ bookingId }, `[Stripe Webhook] Booking ${bookingId} status updated to CANCELLED.`);
        break;
      }

      default:
        logger.debug({ eventType }, `[Stripe Webhook] Unhandled event type: ${eventType}`);
    }

    return res.json({ received: true });
  } catch (err: any) {
    logger.error({ err }, '[Stripe Webhook] Execution error handling event');
    return res.status(500).json({ error: 'Webhook processing error' });
  }
});

export default router;
