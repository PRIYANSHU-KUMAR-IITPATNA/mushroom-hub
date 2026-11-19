import { createHash, randomUUID } from 'node:crypto'
import {
  FarmerPurchaseRatePolicyStatus,
  HarvestDecisionStatus,
  HarvestStatus,
  InventoryMovementType,
  LedgerEntryType,
  Prisma,
  ProductKind,
  QualityGrade,
} from '@prisma/client'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { getPrismaClient } from '../../config/database.js'
import { HttpError } from '../../middleware/errors.js'
import { validateBody } from '../../middleware/request-validation.js'
import { requireAdmin } from '../farmer-applications/routes.js'
import { requireApplicantSession, requireCsrfToken } from '../farmer-applications/auth.js'
import {
  calculateFarmerPayable,
  deriveHarvestDecisionStatus,
  findEffectiveRates,
  gradeQuantitiesMatchInspection,
  type EffectiveFarmerRate,
} from './acceptance.js'

const sessionContext = (response: Parameters<RequestHandler>[1]) => {
  const session = response.locals.session as { userId: string } | undefined
  if (!session) throw new HttpError(401, 'SESSION_REQUIRED', 'Sign in to continue')
  return session
}

const decimalQuantity = z.string().regex(/^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/)
const purchaseRateSchema = z.object({
  reference: z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9._-]+$/),
  grade: z.nativeEnum(QualityGrade),
  ratePerKg: z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/),
  effectiveFrom: z.string().datetime({ offset: true }),
  effectiveTo: z.string().datetime({ offset: true }).nullable().optional(),
  reason: z.string().trim().min(1).max(500),
}).superRefine((value, context) => {
  if (new Prisma.Decimal(value.ratePerKg).lte(0)) {
    context.addIssue({ code: 'custom', path: ['ratePerKg'], message: 'Rate must be greater than zero' })
  }
  if (value.effectiveTo && new Date(value.effectiveTo) <= new Date(value.effectiveFrom)) {
    context.addIssue({ code: 'custom', path: ['effectiveTo'], message: 'End must be after start' })
  }
})

const decisionSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
  grades: z.array(z.object({
    grade: z.nativeEnum(QualityGrade),
    acceptedWeightKg: decimalQuantity,
    rejectedWeightKg: decimalQuantity,
  })).min(1),
}).superRefine((value, context) => {
  const grades = value.grades.map((item) => item.grade)
  if (new Set(grades).size !== grades.length) {
    context.addIssue({ code: 'custom', path: ['grades'], message: 'Each grade may be specified once' })
  }
})

function readIdempotencyKey(value: string | undefined): string {
  if (!value || value.length > 200 || !/^[\w.-]+$/.test(value)) {
    throw new HttpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Submit again to continue')
  }
  return value
}

function requestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
}

function toDecisionResponse(
  decision: {
    id: string
    status: HarvestDecisionStatus
    decidedAt: Date
    harvestId: string
  },
  grades: Array<{
    grade: QualityGrade
    inspectedWeightKg: Prisma.Decimal
    acceptedWeightKg: Prisma.Decimal
    rejectedWeightKg: Prisma.Decimal
  }>,
  payables: Array<{
    qualityGrade: QualityGrade | null
    acceptedQuantity: Prisma.Decimal | null
    ratePerKg: Prisma.Decimal | null
    pricingPolicyReference: string | null
    amount: Prisma.Decimal
  }>,
) {
  const gradePayables = payables.map((entry) => ({
    grade: entry.qualityGrade,
    acceptedQuantityKg: entry.acceptedQuantity?.toFixed(3) ?? null,
    ratePerKg: entry.ratePerKg?.toFixed(2) ?? null,
    pricingPolicyReference: entry.pricingPolicyReference,
    payableAmount: entry.amount.toFixed(2),
  }))
  const totalPayable = payables.reduce(
    (total, entry) => total.add(entry.amount),
    new Prisma.Decimal(0),
  )

  return {
    decisionId: decision.id,
    harvestId: decision.harvestId,
    status: decision.status,
    decidedAt: decision.decidedAt,
    grades: grades.map((grade) => ({
      grade: grade.grade,
      inspectedWeightKg: grade.inspectedWeightKg.toFixed(3),
      acceptedWeightKg: grade.acceptedWeightKg.toFixed(3),
      rejectedWeightKg: grade.rejectedWeightKg.toFixed(3),
      payable: gradePayables.find((payable) => payable.grade === grade.grade) ?? null,
    })),
    totalPayable: totalPayable.toFixed(2),
    currency: 'INR',
  }
}

export function createAdminHarvestRouter(): Router {
  const router = Router()
  router.use(requireApplicantSession, requireAdmin, requireCsrfToken)

  router.post(
    '/farmer-purchase-rate-policies',
    validateBody(purchaseRateSchema),
    async (request, response) => {
      const session = sessionContext(response)
      const prisma = getPrismaClient()
      const effectiveFrom = new Date(request.body.effectiveFrom)
      const effectiveTo = request.body.effectiveTo ? new Date(request.body.effectiveTo) : null
      const maxDate = new Date('9999-12-31T23:59:59.999Z')
      const createPolicy = () => prisma.$transaction(async (transaction) => {
        const overlapping = await transaction.farmerPurchaseRatePolicy.findFirst({
          where: {
            grade: request.body.grade,
            status: FarmerPurchaseRatePolicyStatus.APPROVED,
            effectiveFrom: { lt: effectiveTo ?? maxDate },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveFrom } }],
          },
          select: { id: true },
        })
        if (overlapping) {
          throw new HttpError(409, 'RATE_POLICY_OVERLAP', 'An approved rate policy already covers part of this period')
        }

        const now = new Date()
        const created = await transaction.farmerPurchaseRatePolicy.create({
          data: {
            reference: request.body.reference,
            grade: request.body.grade,
            ratePerKg: new Prisma.Decimal(request.body.ratePerKg),
            currency: 'INR',
            effectiveFrom,
            effectiveTo,
            status: FarmerPurchaseRatePolicyStatus.APPROVED,
            approvedAt: now,
            approvedById: session.userId,
            createdById: session.userId,
          },
          select: { id: true, reference: true, grade: true, ratePerKg: true, effectiveFrom: true, effectiveTo: true },
        })
        await transaction.auditLog.create({
          data: {
            actorId: session.userId,
            action: 'FARMER_PURCHASE_RATE_POLICY_APPROVED',
            entityType: 'FarmerPurchaseRatePolicy',
            entityId: created.id,
            requestId: response.locals.requestId,
            metadata: {
              reference: created.reference,
              grade: created.grade,
              ratePerKg: created.ratePerKg.toFixed(2),
              currency: 'INR',
              effectiveFrom: created.effectiveFrom.toISOString(),
              effectiveTo: created.effectiveTo?.toISOString() ?? null,
              reason: request.body.reason,
            },
          },
        })
        return created
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      let policy: Awaited<ReturnType<typeof createPolicy>>
      try {
        policy = await createPolicy()
      } catch (error) {
        if (isPrismaError(error, 'P2002')) {
          throw new HttpError(409, 'RATE_POLICY_REFERENCE_CONFLICT', 'The policy reference or effective start already exists')
        }
        if (isPrismaError(error, 'P2034')) {
          throw new HttpError(409, 'RATE_POLICY_CHANGED', 'A rate policy changed concurrently; retry the request')
        }
        throw error
      }

      response.status(201).json({
        data: {
          ...policy,
          ratePerKg: policy.ratePerKg.toFixed(2),
          currency: 'INR',
        },
        error: null,
        meta: { requestId: response.locals.requestId },
      })
    },
  )

  router.post(
    '/harvests/:id/decision',
    validateBody(decisionSchema),
    async (request, response) => {
      const session = sessionContext(response)
      const harvestIdParameter = request.params.id
      if (
        typeof harvestIdParameter !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(harvestIdParameter)
      ) {
        throw new HttpError(400, 'INVALID_HARVEST_ID', 'The harvest identifier is invalid')
      }
      const harvestId = harvestIdParameter

      const key = readIdempotencyKey(request.get('Idempotency-Key'))
      const gradesInput = [...request.body.grades].sort((a, b) => a.grade.localeCompare(b.grade))
      const inputHash = requestHash({ reason: request.body.reason, grades: gradesInput })
      const prisma = getPrismaClient()

      const loadExisting = async (decisionId: string, transaction: Prisma.TransactionClient) => {
        const decision = await transaction.harvestDecision.findUnique({
          where: { id: decisionId },
          select: { id: true, status: true, decidedAt: true, harvestId: true },
        })
        if (!decision) throw new HttpError(409, 'HARVEST_ALREADY_DECIDED', 'The harvest decision is no longer available')
        const [grades, payables] = await Promise.all([
          transaction.harvestGradeResult.findMany({
            where: { harvestId: decision.harvestId },
            orderBy: { grade: 'asc' },
            select: { grade: true, inspectedWeightKg: true, acceptedWeightKg: true, rejectedWeightKg: true },
          }),
          transaction.farmerPayableLedgerEntry.findMany({
            where: { harvestDecisionId: decision.id },
            select: {
              qualityGrade: true,
              acceptedQuantity: true,
              ratePerKg: true,
              pricingPolicyReference: true,
              amount: true,
            },
          }),
        ])
        return toDecisionResponse(decision, grades, payables)
      }

      const accept = () => prisma.$transaction(async (transaction) => {
        const prior = await transaction.idempotencyKey.findUnique({
          where: {
            actorId_operation_key: {
              actorId: session.userId,
              operation: 'harvest.accept',
              key,
            },
          },
          select: { requestHash: true, resourceId: true },
        })
        if (prior) {
          if (prior.requestHash !== inputHash || !prior.resourceId) {
            throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'This operation key was already used')
          }
          return loadExisting(prior.resourceId, transaction)
        }

        const harvest = await transaction.harvestSubmission.findUnique({
          where: { id: harvestId },
          select: {
            id: true,
            farmerId: true,
            status: true,
            collectionCentreId: true,
            receivedAt: true,
            receivedById: true,
            weighings: {
              select: { collectionCentreId: true },
            },
            grades: {
              orderBy: { grade: 'asc' },
              select: { id: true, grade: true, inspectedWeightKg: true },
            },
          },
        })
        if (!harvest) throw new HttpError(404, 'HARVEST_NOT_FOUND', 'The harvest was not found')
        if (harvest.status !== HarvestStatus.GRADED) {
          throw new HttpError(409, 'HARVEST_NOT_READY', 'Only a physically received and graded harvest can be decided')
        }
        if (
          !harvest.collectionCentreId ||
          !harvest.receivedAt ||
          !harvest.receivedById ||
          !harvest.weighings.some((weighing) => weighing.collectionCentreId === harvest.collectionCentreId) ||
          harvest.grades.length === 0
        ) {
          throw new HttpError(409, 'HARVEST_INCOMPLETE', 'The harvest is missing receipt or grade records')
        }

        const inputByGrade = new Map(gradesInput.map((grade) => [grade.grade, grade]))
        if (
          inputByGrade.size !== harvest.grades.length ||
          harvest.grades.some((grade) => !inputByGrade.has(grade.grade))
        ) {
          throw new HttpError(400, 'GRADE_SET_MISMATCH', 'Provide accepted and rejected quantities for every recorded grade')
        }

        const quantities = harvest.grades.map((grade) => {
          const input = inputByGrade.get(grade.grade)!
          const accepted = new Prisma.Decimal(input.acceptedWeightKg)
          const rejected = new Prisma.Decimal(input.rejectedWeightKg)
          if (!gradeQuantitiesMatchInspection(accepted, rejected, grade.inspectedWeightKg)) {
            throw new HttpError(400, 'GRADE_QUANTITY_MISMATCH', 'Accepted and rejected quantities must account for the full inspected weight')
          }
          return { ...grade, accepted, rejected }
        })
        const acceptedGrades = quantities.filter((grade) => grade.accepted.gt(0))
        const acceptedTotal = quantities.reduce((total, grade) => total.add(grade.accepted), new Prisma.Decimal(0))
        const inspectedTotal = quantities.reduce((total, grade) => total.add(grade.inspectedWeightKg), new Prisma.Decimal(0))
        const decisionStatus = deriveHarvestDecisionStatus(acceptedTotal, inspectedTotal)
        const harvestStatus =
          decisionStatus === HarvestDecisionStatus.ACCEPTED
            ? HarvestStatus.ACCEPTED
            : decisionStatus === HarvestDecisionStatus.PARTIALLY_ACCEPTED
              ? HarvestStatus.PARTIALLY_ACCEPTED
              : HarvestStatus.REJECTED
        const decidedAt = new Date()

        const policies = acceptedGrades.length
          ? await transaction.farmerPurchaseRatePolicy.findMany({
              where: {
                grade: { in: acceptedGrades.map((grade) => grade.grade) },
                status: FarmerPurchaseRatePolicyStatus.APPROVED,
                effectiveFrom: { lte: decidedAt },
                OR: [{ effectiveTo: null }, { effectiveTo: { gt: decidedAt } }],
              },
              select: {
                id: true,
                reference: true,
                grade: true,
                ratePerKg: true,
                effectiveFrom: true,
                effectiveTo: true,
              },
            })
          : []

        const policiesByGrade = new Map<QualityGrade, EffectiveFarmerRate>()
        for (const grade of acceptedGrades) {
          const applicable = findEffectiveRates(policies, grade.grade, decidedAt)
          if (applicable.length !== 1) {
            throw new HttpError(409, 'FARMER_RATE_POLICY_UNAVAILABLE', 'No single approved rate policy applies to every accepted grade')
          }
          policiesByGrade.set(grade.grade, applicable[0])
        }

        const products = acceptedGrades.length
          ? await transaction.product.findMany({
              where: {
                kind: ProductKind.MUSHROOM,
                active: true,
                qualityGrade: { in: acceptedGrades.map((grade) => grade.grade) },
              },
              select: { id: true, qualityGrade: true, unitCode: true },
            })
          : []
        const productsByGrade = new Map(products.map((product) => [product.qualityGrade, product]))
        if (acceptedGrades.some((grade) => {
          const product = productsByGrade.get(grade.grade)
          return !product || product.unitCode.toLowerCase() !== 'kg'
        })) {
          throw new HttpError(409, 'GRADE_PRODUCT_NOT_CONFIGURED', 'An active kilogram product is not configured for every accepted grade')
        }

        const moved = await transaction.harvestSubmission.updateMany({
          where: { id: harvest.id, status: HarvestStatus.GRADED },
          data: { status: harvestStatus },
        })
        if (moved.count !== 1) {
          throw new HttpError(409, 'HARVEST_ALREADY_DECIDED', 'The harvest has already been decided')
        }

        const decision = await transaction.harvestDecision.create({
          data: {
            harvestId: harvest.id,
            status: decisionStatus,
            reason: request.body.reason,
            decidedAt,
            decidedById: session.userId,
          },
          select: { id: true },
        })

        for (const grade of quantities) {
          await transaction.harvestGradeResult.update({
            where: { id: grade.id },
            data: {
              acceptedWeightKg: grade.accepted,
              rejectedWeightKg: grade.rejected,
            },
          })
          if (grade.accepted.isZero()) continue

          const policy = policiesByGrade.get(grade.grade)!
          const amount = calculateFarmerPayable(grade.accepted, policy.ratePerKg)
          if (amount.lte(0)) {
            throw new HttpError(409, 'PAYABLE_ROUNDS_TO_ZERO', 'The approved rate and accepted quantity produce no payable after currency rounding')
          }
          const product = productsByGrade.get(grade.grade)!
          const sourceReference = `harvest-decision:${decision.id}:grade:${grade.grade}`
          await transaction.farmerPayableLedgerEntry.create({
            data: {
              farmerId: harvest.farmerId,
              harvestDecisionId: decision.id,
              harvestGradeResultId: grade.id,
              pricingPolicyId: policy.id,
              qualityGrade: grade.grade,
              acceptedQuantity: grade.accepted,
              unitCode: 'kg',
              ratePerKg: policy.ratePerKg,
              pricingPolicyReference: policy.reference,
              type: LedgerEntryType.CREDIT,
              amount,
              currency: 'INR',
              sourceReference,
              note: `Accepted harvest ${harvest.id}, grade ${grade.grade}`,
              recordedById: session.userId,
            },
          })
          const batch = await transaction.inventoryBatch.create({
            data: {
              batchCode: `HARVEST-${grade.grade}-${randomUUID()}`,
              productId: product.id,
              harvestId: harvest.id,
              gradeResultId: grade.id,
              collectionCentreId: harvest.collectionCentreId,
              receivedQuantity: grade.accepted,
              quantityOnHand: grade.accepted,
              quantityReserved: new Prisma.Decimal(0),
            },
            select: { id: true },
          })
          await transaction.inventoryMovement.create({
            data: {
              batchId: batch.id,
              type: InventoryMovementType.HARVEST_RECEIPT,
              onHandDelta: grade.accepted,
              reservedDelta: new Prisma.Decimal(0),
              reason: `Accepted harvest ${harvest.id}, grade ${grade.grade}`,
              actorId: session.userId,
            },
          })
        }

        await transaction.auditLog.create({
          data: {
            actorId: session.userId,
            action: 'HARVEST_DECISION_RECORDED',
            entityType: 'HarvestSubmission',
            entityId: harvest.id,
            requestId: response.locals.requestId,
            metadata: {
              decisionId: decision.id,
              status: decisionStatus,
              reason: request.body.reason,
              grades: quantities.map((grade) => ({
                grade: grade.grade,
                inspectedWeightKg: grade.inspectedWeightKg.toFixed(3),
                acceptedWeightKg: grade.accepted.toFixed(3),
                rejectedWeightKg: grade.rejected.toFixed(3),
                policyReference: policiesByGrade.get(grade.grade)?.reference ?? null,
                ratePerKg: policiesByGrade.get(grade.grade)?.ratePerKg.toFixed(2) ?? null,
              })),
            },
          },
        })
        await transaction.idempotencyKey.create({
          data: {
            actorId: session.userId,
            operation: 'harvest.accept',
            key,
            requestHash: inputHash,
            resourceType: 'harvest-decision',
            resourceId: decision.id,
            expiresAt: new Date(decidedAt.getTime() + 1000 * 60 * 60 * 24 * 30),
          },
        })

        return loadExisting(decision.id, transaction)
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 30000,
      })

      let result: Awaited<ReturnType<typeof accept>>
      try {
        result = await accept()
      } catch (error) {
        if (!isPrismaError(error, 'P2002') && !isPrismaError(error, 'P2034')) throw error
        const prior = await prisma.idempotencyKey.findUnique({
          where: {
            actorId_operation_key: {
              actorId: session.userId,
              operation: 'harvest.accept',
              key,
            },
          },
          select: { requestHash: true, resourceId: true },
        })
        if (prior?.requestHash === inputHash && prior.resourceId) {
          result = await prisma.$transaction((transaction) => loadExisting(prior.resourceId!, transaction))
        } else if (isPrismaError(error, 'P2034')) {
          throw new HttpError(409, 'HARVEST_CHANGED', 'The harvest changed during this decision; retry with the same idempotency key')
        } else if (prior) {
          throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'This operation key was already used')
        } else {
          throw new HttpError(409, 'HARVEST_ALREADY_DECIDED', 'The harvest has already been decided')
        }
      }

      response.status(200).json({
        data: result,
        error: null,
        meta: { requestId: response.locals.requestId },
      })
    },
  )

  return router
}
