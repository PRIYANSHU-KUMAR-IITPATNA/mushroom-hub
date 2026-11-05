import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ZodError } from 'zod'
import { logger } from '../utils/logger.js'

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new HttpError(404, 'NOT_FOUND', 'The requested resource was not found'))
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  const requestId = response.locals.requestId as string | undefined
  if (error instanceof ZodError) {
    response.status(400).json({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
        requestId,
      },
    })
    return
  }

  if (isMalformedJsonError(error)) {
    response.status(400).json({
      data: null,
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must contain valid JSON',
        details: [],
        requestId,
      },
    })
    return
  }

  if (error instanceof HttpError) {
    response.status(error.statusCode).json({
      data: null,
      error: {
        code: error.code,
        message: error.message,
        details: [],
        requestId,
      },
    })
    return
  }

  logger.error(
    {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      requestId,
    },
    'Unhandled request error',
  )
  response.status(500).json({
    data: null,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      details: [],
      requestId,
    },
  })
}

function isMalformedJsonError(error: unknown): error is SyntaxError & { status: number } {
  return (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400 &&
    'body' in error
  )
}
