import Razorpay from 'razorpay';
import crypto from 'crypto';
import { config } from '../config/env';

export const razorpay: any = config.payments.razorpay.isConfigured
  ? new Razorpay({
      key_id: config.payments.razorpay.keyId!,
      key_secret: config.payments.razorpay.keySecret!,
    })
  : null;

/**
 * Validates Razorpay Payment Signature using HMAC SHA-256
 */
export function verifyRazorpaySignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const secret = config.payments.razorpay.keySecret;
  if (!secret) return false;

  const generatedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest('hex');

  return generatedSignature === params.signature;
}
