import { randomUUID } from 'node:crypto'
import cors from 'cors'
import express, { type RequestHandler } from 'express'
import helmet from 'helmet'
import type { Logger } from 'pino'
import { errorHandler, notFoundHandler } from './middleware/errors.js'
import { apiRouter } from './routes/index.js'
import { logger as defaultLogger } from './utils/logger.js'

export type AppOptions = {
  corsOrigins: string[]
  logger?: Logger
}

function requestLogger(log: Logger): RequestHandler {
  return (request, response, next) => {
    const requestId = randomUUID()
    const startedAt = performance.now()
    response.locals.requestId = requestId
    response.setHeader('X-Request-Id', requestId)
    response.on('finish', () => {
      log.info(
        {
          requestId,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        },
        'HTTP request completed',
      )
    })
    next()
  }
}

export function createApp(options: AppOptions) {
  const app = express()
  const log = options.logger ?? defaultLogger

  app.disable('x-powered-by')
  app.use(requestLogger(log))
  app.use(helmet())
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || options.corsOrigins.includes(origin)) {
          callback(null, true)
          return
        }
        callback(null, false)
      },
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
      maxAge: 600,
    }),
  )
  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_request, response) => {
    response.status(200).json({
      data: { status: 'ok' },
      error: null,
      meta: { requestId: response.locals.requestId },
    })
  })
  app.use('/api/v1', apiRouter)
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
