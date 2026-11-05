import { Router } from 'express'
import { healthRouter } from '../modules/health/routes.js'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
