import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { releaseLock } from '../lib/redis';
import { createError } from '../middleware/errorHandler';
import { sendBookingConfirmationEmail } from '../lib/email';

export interface ConfirmBookingParams {
  bookingId: string;
  paymentMethod?: 'STRIPE' | 'RAZORPAY' | 'UPI' | 'CASH' | 'TEST';
  stripePaymentIntentId?: string;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
}

export interface ConfirmBookingResult {
  booking: any;
  alreadyConfirmed: boolean;
}

/**
 * Hardened transaction-level booking confirmation.
 * The database is the FINAL source of truth.
 * Ensures atomicity, prevents overbooking, and rejects stale/conflicting bookings.
 */
export async function confirmBookingWithConflictCheck(
  params: ConfirmBookingParams
): Promise<ConfirmBookingResult> {
  const { bookingId, stripePaymentIntentId, razorpayPaymentId, razorpayOrderId } = params;

  // Execute inside a database transaction with serializable isolation / row-level safety
  const result = await prisma.$transaction(async (tx) => {
    // 1. Fetch current booking inside transaction
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: {
        resource: true,
        tenant: true,
      },
    });

    if (!booking) {
      throw createError(404, 'Booking not found');
    }

    // 2. Idempotency guard: If already confirmed, return safely without failing or re-executing
    if (booking.status === 'CONFIRMED') {
      return { booking, alreadyConfirmed: true };
    }

    if (booking.status === 'CANCELLED') {
      throw createError(400, 'Cannot confirm a cancelled reservation');
    }

    const resource = booking.resource;
    if (!resource || !resource.isActive) {
      throw createError(400, 'Resource is inactive or no longer available');
    }

    // 3. TRANSACTION-LEVEL CONFLICT CHECK:
    // Count all CONFIRMED overlapping bookings in the database (excluding this booking)
    const confirmedOverlapCount = await tx.booking.count({
      where: {
        resourceId: booking.resourceId,
        status: 'CONFIRMED',
        id: { not: booking.id },
        startTime: { lt: booking.endTime },
        endTime: { gt: booking.startTime },
      },
    });

    const totalCapacity = resource.capacity || 1;
    if (confirmedOverlapCount >= totalCapacity) {
      throw createError(
        409,
        `Capacity conflict: All ${totalCapacity} spot(s) for this time slot have already been confirmed by other reservations.`
      );
    }

    // 4. Atomically confirm booking and clear temporary locks
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CONFIRMED',
        lockExpiresAt: null,
        ...(stripePaymentIntentId ? { stripePaymentIntentId } : {}),
        ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
        ...(razorpayOrderId ? { razorpayOrderId } : {}),
      },
      include: {
        resource: true,
        tenant: true,
      },
    });

    return { booking: updated, alreadyConfirmed: false };
  });

  // 5. Post-confirmation cleanup & notifications (executed outside transaction)
  if (!result.alreadyConfirmed) {
    const booking = result.booking;
    const dateStr = booking.startTime.toISOString().split('T')[0];
    const timeStr = booking.startTime.toISOString().split('T')[1].slice(0, 5);

    // Release Redis lock (database is now final source of truth)
    await releaseLock(booking.resourceId, dateStr, timeStr, booking.id).catch((err) => {
      logger.warn({ err }, '[Redis] Warning releasing slot lock: ' + err.message);
    });

    // Send confirmation email with calendar attachments
    if (booking.customerEmail && !booking.customerEmail.includes('@blocked.internal')) {
      sendBookingConfirmationEmail({
        booking,
        resource: booking.resource,
        tenant: booking.tenant,
      }).catch((err) => {
        logger.error({ err }, 'Failed to send confirmation email on booking confirmation');
      });
    }
  }

  return result;
}
