import pino from 'pino';
import { config } from '../config/env';

const redactOptions = {
  paths: [
    'password',
    '*.password',
    'otp',
    '*.otp',
    'token',
    '*.token',
    'secret',
    '*.secret',
    'authorization',
    'headers.authorization',
    'req.headers.authorization',
    'cookie',
    'headers.cookie',
    'req.headers.cookie',
    'creditCard',
    '*.creditCard',
    'cardNumber',
    'cvv',
  ],
  censor: '[REDACTED]',
};

function createLogger(): pino.Logger {
  if (config.logging.pretty) {
    try {
      // Dynamic require so pino-pretty is purely an optional devDependency in production builds
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pretty = require('pino-pretty');
      return pino(
        {
          level: config.logging.level,
          redact: redactOptions,
        },
        pretty({
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
        })
      );
    } catch {
      // Fallback to standard pino if pino-pretty cannot be loaded
    }
  }

  return pino({
    level: config.logging.level,
    redact: redactOptions,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  });
}

export const logger = createLogger();
