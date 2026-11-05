import { Router } from 'express'
import { healthRouter } from '../modules/health/routes.js'
import { createAuthRouter } from '../modules/farmer-applications/auth.js'
import {
  createAdminFarmerApplicationsRouter,
  createFarmerApplicationsRouter,
} from '../modules/farmer-applications/routes.js'
import type { SmsProvider } from '../modules/farmer-applications/sms-provider.js'
import type { EmailProvider } from '../modules/farmer-applications/email-provider.js'

export function createApiRouter(smsProvider?: SmsProvider, emailProvider?: EmailProvider) {
  const apiRouter = Router()

  apiRouter.use('/health', healthRouter)
  apiRouter.use('/auth', createAuthRouter(smsProvider, emailProvider))
  apiRouter.use('/farmer-applications', createFarmerApplicationsRouter())
  apiRouter.use('/admin/farmer-applications', createAdminFarmerApplicationsRouter())

  return apiRouter
}
