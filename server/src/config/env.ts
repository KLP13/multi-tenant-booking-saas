import path from 'path';
import dotenv from 'dotenv';

// Ensure dotenv is loaded before reading environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export interface ServerConfig {
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  port: number;
  clientUrl: string;
  database: {
    url: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  redis: {
    url?: string;
    host?: string;
    port?: number;
  };
  payments: {
    stripe: {
      secretKey?: string;
      publishableKey?: string;
      webhookSecret?: string;
      isConfigured: boolean;
    };
    razorpay: {
      keyId?: string;
      keySecret?: string;
      isConfigured: boolean;
    };
  };
  email: {
    resendApiKey?: string;
    fromEmail: string;
    smtp?: {
      host: string;
      port: number;
      user: string;
      pass: string;
      secure: boolean;
    };
    isConfigured: boolean;
  };
  logging: {
    level: string;
    pretty: boolean;
  };
  security: {
    exposeDevOtp: boolean;
    exposeStackTraces: boolean;
  };
}

class ConfigurationError extends Error {
  constructor(public errors: string[]) {
    super(
      `\n❌ Configuration Validation Failed with ${errors.length} error(s):\n` +
      errors.map((e, idx) => `   [${idx + 1}] ${e}`).join('\n') +
      '\n'
    );
    this.name = 'ConfigurationError';
  }
}

function parseAndValidateConfig(): ServerConfig {
  const errors: string[] = [];

  // 1. Environment mode
  const rawNodeEnv = (process.env.NODE_ENV || 'development').toLowerCase().trim();
  const validEnvs: Array<'development' | 'production' | 'test'> = ['development', 'production', 'test'];
  const nodeEnv = (validEnvs.includes(rawNodeEnv as any) ? rawNodeEnv : 'development') as 'development' | 'production' | 'test';

  const isProduction = nodeEnv === 'production';
  const isDevelopment = nodeEnv === 'development';
  const isTest = nodeEnv === 'test';

  // 2. Server Port & Client URL
  const rawPort = process.env.PORT || '5000';
  const port = parseInt(rawPort, 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    errors.push(`PORT must be a valid integer between 1 and 65535 (received "${rawPort}")`);
  }

  const clientUrl = (process.env.CLIENT_URL || (isProduction ? '' : 'http://localhost:3000')).trim();
  if (isProduction) {
    if (!clientUrl) {
      errors.push('CLIENT_URL is required in production (e.g. "https://yourdomain.com")');
    } else if (clientUrl.includes('localhost') || clientUrl.includes('127.0.0.1')) {
      errors.push(`CLIENT_URL cannot point to localhost in production (received "${clientUrl}")`);
    }
  }

  // 3. Database URL
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    errors.push('DATABASE_URL is required for database connectivity');
  } else if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    errors.push('DATABASE_URL must be a valid PostgreSQL connection string starting with postgresql:// or postgres://');
  }

  // 4. JWT Secret Validation
  const INSECURE_JWT_DEFAULTS = [
    'super-secret-jwt-key-for-dev',
    'secret',
    'changeme',
    '123456',
    'jwt-secret',
    'default_secret',
  ];
  let jwtSecret = (process.env.JWT_SECRET || '').trim();

  if (isProduction) {
    if (!jwtSecret) {
      errors.push('JWT_SECRET is required in production');
    } else if (INSECURE_JWT_DEFAULTS.includes(jwtSecret.toLowerCase())) {
      errors.push(`JWT_SECRET cannot use an insecure default or placeholder in production (received "${jwtSecret}")`);
    } else if (jwtSecret.length < 32) {
      errors.push(`JWT_SECRET must be at least 32 characters long in production for cryptographic safety (current length: ${jwtSecret.length})`);
    }
  } else {
    // In development/test, fallback safely if not provided
    if (!jwtSecret) {
      jwtSecret = 'super-secret-jwt-key-for-dev';
      console.warn('⚠️  [Config Warning] JWT_SECRET is not set in development. Using fallback dev key.');
    }
  }

  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';

  // 5. Payment Configuration & Webhook Secrets
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const isStripeConfigured = Boolean(stripeSecretKey && stripeSecretKey !== 'sk_test_placeholder');

  if (isProduction && isStripeConfigured) {
    if (!stripeWebhookSecret) {
      errors.push('STRIPE_WEBHOOK_SECRET is required in production when Stripe payments are enabled to verify incoming event signatures');
    }
  }

  const razorpayKeyId = process.env.RAZORPAY_KEY_ID?.trim();
  const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const isRazorpayConfigured = Boolean(razorpayKeyId && razorpayKeySecret);

  if ((razorpayKeyId && !razorpayKeySecret) || (!razorpayKeyId && razorpayKeySecret)) {
    errors.push('Both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be provided together');
  }

  // 6. Email Configuration
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpSecure = process.env.SMTP_SECURE === 'true';

  const hasSmtp = Boolean(smtpHost && smtpUser && smtpPass);
  const hasResend = Boolean(resendApiKey);
  const isEmailConfigured = hasResend || hasSmtp;

  if (isProduction && !isEmailConfigured) {
    errors.push('Production requires either RESEND_API_KEY or complete SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASS) for transactional emails');
  }

  const fromEmail = (
    process.env.EMAIL_FROM ||
    process.env.SMTP_FROM ||
    '"Bespoke Bookings" <noreply@bespokebookings.com>'
  ).trim();

  // 7. Structured Logging Configuration
  const rawLogLevel = (process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info')).toLowerCase().trim();
  const validLogLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
  const logLevel = validLogLevels.includes(rawLogLevel) ? rawLogLevel : (isDevelopment ? 'debug' : 'info');

  // 8. Security & Development Fallback Restrictions
  const exposeDevOtp = process.env.EXPOSE_DEV_OTP === 'true';
  if (isProduction && exposeDevOtp) {
    errors.push('CRITICAL: EXPOSE_DEV_OTP cannot be set to "true" in production! OTPs must never be exposed via API responses.');
  }

  // Stack traces: strictly forbidden in production; in development requires explicit opt-in
  const rawExposeStack = process.env.EXPOSE_STACK_TRACES === 'true';
  if (isProduction && rawExposeStack) {
    errors.push('CRITICAL: EXPOSE_STACK_TRACES cannot be enabled in production! Stack traces must never be exposed via HTTP.');
  }
  const exposeStackTraces = isDevelopment && rawExposeStack;

  // If any errors were detected, fail fast and prevent startup
  if (errors.length > 0) {
    const errorInstance = new ConfigurationError(errors);
    console.error('\n' + '='.repeat(70));
    console.error('🚨 FATAL CONFIGURATION ERROR - APPLICATION STARTUP ABORTED');
    console.error('='.repeat(70));
    console.error(errorInstance.message);
    console.error('='.repeat(70) + '\n');
    throw errorInstance;
  }

  return {
    nodeEnv,
    isProduction,
    isDevelopment,
    isTest,
    port,
    clientUrl,
    database: {
      url: databaseUrl,
    },
    jwt: {
      secret: jwtSecret,
      expiresIn: jwtExpiresIn,
    },
    redis: {
      url: process.env.REDIS_URL?.trim(),
      host: process.env.REDIS_HOST?.trim(),
      port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : undefined,
    },
    payments: {
      stripe: {
        secretKey: stripeSecretKey,
        publishableKey: stripePublishableKey,
        webhookSecret: stripeWebhookSecret,
        isConfigured: isStripeConfigured,
      },
      razorpay: {
        keyId: razorpayKeyId,
        keySecret: razorpayKeySecret,
        isConfigured: isRazorpayConfigured,
      },
    },
    email: {
      resendApiKey,
      fromEmail,
      smtp: hasSmtp
        ? {
            host: smtpHost!,
            port: isNaN(smtpPort) ? 587 : smtpPort,
            user: smtpUser!,
            pass: smtpPass!,
            secure: smtpSecure,
          }
        : undefined,
      isConfigured: isEmailConfigured,
    },
    logging: {
      level: logLevel,
      pretty: isDevelopment,
    },
    security: {
      exposeDevOtp: isDevelopment && exposeDevOtp,
      exposeStackTraces,
    },
  };
}

export const config = parseAndValidateConfig();
