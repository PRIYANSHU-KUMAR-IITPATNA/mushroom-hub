import { Router } from 'express'
import { healthRouter } from '../modules/health/routes.js'
import { createAuthRouter } from '../modules/farmer-applications/auth.js'
import {
  createAdminFarmerApplicationsRouter,
  createFarmerApplicationsRouter,
} from '../modules/farmer-applications/routes.js'
import type { SmsProvider } from '../modules/farmer-applications/sms-provider.js'

export function createApiRouter(smsProvider?: SmsProvider) {
  const apiRouter = Router()

  apiRouter.use('/health', healthRouter)
  apiRouter.use('/auth', createAuthRouter(smsProvider))
  apiRouter.use('/farmer-applications', createFarmerApplicationsRouter())
  apiRouter.use('/admin/farmer-applications', createAdminFarmerApplicationsRouter())

  return apiRouter
}
