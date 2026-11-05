import 'dotenv/config'
import { createServer } from 'node:http'
import { parseEnvironment, EnvironmentValidationError } from './config/env.js'
import { connectDatabase, disconnectDatabase } from './config/database.js'
import { createApp } from './app.js'
import { logger } from './utils/logger.js'

async function startServer(): Promise<void> {
  let environment
  try {
    environment = parseEnvironment(process.env)
  } catch (error) {
    if (error instanceof EnvironmentValidationError) {
      logger.fatal(
        {
          issues: error.issues.map(({ path, message }) => ({
            path: path.join('.'),
            message,
          })),
        },
        'Invalid backend environment configuration',
      )
      process.exitCode = 1
      return
    }
    throw error
  }

  await connectDatabase()
  const server = createServer(
    createApp({
      corsOrigins: environment.CORS_ORIGINS,
    }),
  )

  server.listen(environment.PORT, '0.0.0.0', () => {
    logger.info({ port: environment.PORT, nodeEnv: environment.NODE_ENV }, 'Backend listening')
  })

  let shuttingDown = false
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, 'Graceful shutdown started')
    server.close((error) => {
      if (error) {
        logger.error(
          { errorName: error.name },
          'HTTP server failed to close cleanly',
        )
        process.exitCode = 1
      }
      void disconnectDatabase()
        .then(() => {
          logger.info('Backend shutdown complete')
        })
        .catch((disconnectError: unknown) => {
          logger.error(
            {
              errorName:
                disconnectError instanceof Error ? disconnectError.name : 'UnknownError',
            },
            'Database disconnect failed',
          )
          process.exitCode = 1
        })
    })
  }

  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}

void startServer().catch((error: unknown) => {
  logger.fatal(
    { errorName: error instanceof Error ? error.name : 'UnknownError' },
    'Backend startup failed',
  )
  void disconnectDatabase()
    .catch((disconnectError: unknown) => {
      logger.error(
        {
          errorName:
            disconnectError instanceof Error ? disconnectError.name : 'UnknownError',
        },
        'Database disconnect failed after startup error',
      )
    })
    .finally(() => {
      process.exitCode = 1
    })
})
