import { Router } from 'express'
import { healthRouter } from '../modules/health/routes.js'
import { createAdminHarvestRouter } from '../modules/harvests/routes.js'
import { createAuthRouter } from '../modules/farmer-applications/auth.js'
import {
  createAdminFarmerApplicationsRouter,
  createFarmerApplicationsRouter,
} from '../modules/farmer-applications/routes.js'
import type { SmsProvider } from '../modules/farmer-applications/sms-provider.js'
import type { EmailProvider } from '../modules/farmer-applications/email-provider.js'
import type { GoogleSheetsSink } from '../modules/farmer-applications/google-sheets-sink.js'

export function createApiRouter(smsProvider?: SmsProvider, emailProvider?: EmailProvider, googleSheetsSink?: GoogleSheetsSink) {
  const apiRouter = Router()

  apiRouter.use('/health', healthRouter)
  apiRouter.use('/auth', createAuthRouter(smsProvider, emailProvider))
  apiRouter.use('/farmer-applications', createFarmerApplicationsRouter(googleSheetsSink))
  apiRouter.use('/admin/farmer-applications', createAdminFarmerApplicationsRouter())
  apiRouter.use('/admin', createAdminHarvestRouter())

  return apiRouter
}
