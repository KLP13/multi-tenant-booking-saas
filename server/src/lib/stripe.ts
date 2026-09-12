import { logger } from './logger';
import Stripe from 'stripe';
import { config } from '../config/env';

if (!config.payments.stripe.isConfigured) {
  logger.warn('⚠️  STRIPE_SECRET_KEY not set — payment features will not work');
}

export const stripe = new Stripe(config.payments.stripe.secretKey ?? 'sk_test_placeholder', {
  apiVersion: '2026-08-26.dahlia' as any,
});
