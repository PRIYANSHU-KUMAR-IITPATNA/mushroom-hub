import pino from 'pino'

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      'password',
      'otp',
      'token',
      'authorization',
      '*.password',
      '*.otp',
      '*.token',
      '*.authorization',
      'DATABASE_URL',
      'DIRECT_DATABASE_URL',
    ],
    censor: '[REDACTED]',
  },
})
