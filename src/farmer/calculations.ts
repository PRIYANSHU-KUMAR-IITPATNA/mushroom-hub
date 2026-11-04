import type { HarvestRecord, PaymentRecord } from './types'

export function isAcceptedHarvest(
  record: HarvestRecord,
): record is HarvestRecord & {
  status: 'accepted'
  acceptedWeightKg: number
  grade: 'A' | 'B' | 'C'
  ratePerKg: number
} {
  return (
    record.status === 'accepted' &&
    typeof record.acceptedWeightKg === 'number' &&
    Number.isFinite(record.acceptedWeightKg) &&
    record.acceptedWeightKg > 0 &&
    (record.grade === 'A' || record.grade === 'B' || record.grade === 'C') &&
    typeof record.ratePerKg === 'number' &&
    Number.isFinite(record.ratePerKg) &&
    record.ratePerKg >= 0 &&
    Number.isFinite(record.acceptedWeightKg * record.ratePerKg)
  )
}

export function acceptedHarvestValue(record: HarvestRecord): number {
  return isAcceptedHarvest(record)
    ? record.acceptedWeightKg * record.ratePerKg
    : 0
}

export function acceptedHarvestPayments(
  record: HarvestRecord,
  payments: PaymentRecord[],
): number {
  if (!isAcceptedHarvest(record)) return 0
  return payments
    .filter(
      (payment) =>
        payment.harvestId === record.id &&
        Number.isFinite(payment.amount) &&
        payment.amount > 0,
    )
    .reduce((sum, payment) => sum + payment.amount, 0)
}

export function acceptedHarvestOutstanding(
  record: HarvestRecord,
  payments: PaymentRecord[],
): number {
  return Math.max(
    0,
    acceptedHarvestValue(record) - acceptedHarvestPayments(record, payments),
  )
}
