import { HarvestDecisionStatus, Prisma, QualityGrade } from '@prisma/client'

export type EffectiveFarmerRate = {
  id: string
  reference: string
  grade: QualityGrade
  ratePerKg: Prisma.Decimal
  effectiveFrom: Date
  effectiveTo: Date | null
}

export function calculateFarmerPayable(
  acceptedQuantityKg: Prisma.Decimal,
  ratePerKg: Prisma.Decimal,
): Prisma.Decimal {
  return acceptedQuantityKg.mul(ratePerKg).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
}

export function gradeQuantitiesMatchInspection(
  acceptedQuantityKg: Prisma.Decimal,
  rejectedQuantityKg: Prisma.Decimal,
  inspectedQuantityKg: Prisma.Decimal,
): boolean {
  return acceptedQuantityKg.add(rejectedQuantityKg).equals(inspectedQuantityKg)
}

export function selectEffectiveRate(
  policies: EffectiveFarmerRate[],
  grade: QualityGrade,
  effectiveAt: Date,
): EffectiveFarmerRate {
  const applicable = findEffectiveRates(policies, grade, effectiveAt)

  if (applicable.length !== 1) {
    throw new Error(
      applicable.length === 0
        ? `No approved farmer purchase rate policy applies to grade ${grade}`
        : `Multiple approved farmer purchase rate policies apply to grade ${grade}`,
    )
  }
  return applicable[0]
}

export function findEffectiveRates(
  policies: EffectiveFarmerRate[],
  grade: QualityGrade,
  effectiveAt: Date,
): EffectiveFarmerRate[] {
  return policies.filter(
    (policy) =>
      policy.grade === grade &&
      policy.effectiveFrom <= effectiveAt &&
      (policy.effectiveTo === null || policy.effectiveTo > effectiveAt),
  )
}

export function deriveHarvestDecisionStatus(
  acceptedTotalKg: Prisma.Decimal,
  inspectedTotalKg: Prisma.Decimal,
): HarvestDecisionStatus {
  if (acceptedTotalKg.isZero()) return HarvestDecisionStatus.REJECTED
  if (acceptedTotalKg.equals(inspectedTotalKg)) return HarvestDecisionStatus.ACCEPTED
  return HarvestDecisionStatus.PARTIALLY_ACCEPTED
}
