import type {
  BagOrder,
  FarmerDemoData,
  FarmerProfile,
  HarvestAuditEntry,
  HarvestRecord,
  PaymentRecord,
  TrainingRegistration,
} from './types'

const STORAGE_KEY = 'mushroom-hub-farmer-demo-v1'

export function createEmptyDemoData(): FarmerDemoData {
  return {
    schemaVersion: 1,
    profile: null,
    bagOrders: [],
    trainingRegistrations: [],
    harvestRecords: [],
    payments: [],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value)
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isProfile(value: unknown): value is FarmerProfile {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.fullName) &&
    isString(value.mobile) &&
    isString(value.state) &&
    isString(value.district) &&
    isString(value.locality) &&
    isString(value.pinCode) &&
    isString(value.registeredAt) &&
    typeof value.mobileVerified === 'boolean'
  )
}

function isBagOrder(value: unknown): value is BagOrder {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.productId) &&
    typeof value.quantity === 'number' &&
    Number.isInteger(value.quantity) &&
    value.quantity > 0 &&
    (value.fulfillment === 'pickup' || value.fulfillment === 'delivery') &&
    isNullableString(value.deliveryAddress) &&
    isNonNegativeNumber(value.unitPrice) &&
    isNonNegativeNumber(value.subtotal) &&
    value.status === 'placed' &&
    isString(value.createdAt)
  )
}

function isTrainingRegistration(
  value: unknown,
): value is TrainingRegistration {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.sessionId) &&
    isString(value.registeredAt) &&
    value.status === 'registered'
  )
}

function isHarvestRecord(value: unknown): value is HarvestRecord {
  const commonFields =
    isRecord(value) &&
    isString(value.id) &&
    isString(value.submittedAt) &&
    (value.status === 'submitted' ||
      value.status === 'accepted' ||
      value.status === 'rejected') &&
    (value.submittedWeightKg === undefined ||
      value.submittedWeightKg === null ||
      (typeof value.submittedWeightKg === 'number' &&
        Number.isFinite(value.submittedWeightKg) &&
        value.submittedWeightKg > 0)) &&
    isNullableString(value.acceptedAt) &&
    (value.rejectedAt === undefined || isNullableString(value.rejectedAt)) &&
    (value.rejectionReason === undefined || isNullableString(value.rejectionReason)) &&
    (value.acceptedWeightKg === null ||
      isNonNegativeNumber(value.acceptedWeightKg)) &&
    (value.grade === null ||
      value.grade === 'A' ||
      value.grade === 'B' ||
      value.grade === 'C') &&
    (value.ratePerKg === null || isNonNegativeNumber(value.ratePerKg))
  if (!commonFields || !isRecord(value)) return false
  if (value.status === 'accepted') {
    return (
      isString(value.acceptedAt) &&
      typeof value.acceptedWeightKg === 'number' &&
      Number.isFinite(value.acceptedWeightKg) &&
      value.acceptedWeightKg > 0 &&
      (value.grade === 'A' || value.grade === 'B' || value.grade === 'C') &&
      isNonNegativeNumber(value.ratePerKg) &&
      Number.isFinite(value.acceptedWeightKg * value.ratePerKg) &&
      (value.auditTrail === undefined ||
        (Array.isArray(value.auditTrail) &&
          value.auditTrail.every(isHarvestAuditEntry)))
    )
  }
  if (value.status === 'rejected') {
    return (
      value.acceptedAt === null &&
      value.acceptedWeightKg === null &&
      value.grade === null &&
      value.ratePerKg === null &&
      isString(value.rejectedAt) &&
      isString(value.rejectionReason) &&
      (value.auditTrail === undefined ||
        (Array.isArray(value.auditTrail) &&
          value.auditTrail.every(isHarvestAuditEntry)))
    )
  }
  return (
    value.acceptedAt === null &&
    value.acceptedWeightKg === null &&
    value.grade === null &&
    value.ratePerKg === null &&
    (value.rejectedAt === undefined || value.rejectedAt === null) &&
    (value.rejectionReason === undefined || value.rejectionReason === null) &&
    (value.auditTrail === undefined ||
      (Array.isArray(value.auditTrail) &&
        value.auditTrail.every(isHarvestAuditEntry)))
  )
}

function isHarvestAuditEntry(value: unknown): value is HarvestAuditEntry {
  return (
    isRecord(value) &&
    isString(value.id) &&
    (value.action === 'submitted' ||
      value.action === 'accepted' ||
      value.action === 'rejected') &&
    isString(value.at) &&
    (value.previousStatus === 'new' ||
      value.previousStatus === 'submitted' ||
      value.previousStatus === 'accepted' ||
      value.previousStatus === 'rejected') &&
    (value.newStatus === 'submitted' ||
      value.newStatus === 'accepted' ||
      value.newStatus === 'rejected') &&
    isNullableString(value.note)
  )
}

function isPaymentRecord(value: unknown): value is PaymentRecord {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.harvestId) &&
    typeof value.amount === 'number' &&
    Number.isFinite(value.amount) &&
    value.amount > 0 &&
    isString(value.paidAt) &&
    value.status === 'paid' &&
    (value.reference === undefined || isString(value.reference))
  )
}

function isDemoData(value: unknown): value is FarmerDemoData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !(value.profile === null || isProfile(value.profile)) ||
    !Array.isArray(value.bagOrders) ||
    !value.bagOrders.every(isBagOrder) ||
    !Array.isArray(value.trainingRegistrations) ||
    !value.trainingRegistrations.every(isTrainingRegistration) ||
    !Array.isArray(value.harvestRecords) ||
    !value.harvestRecords.every(isHarvestRecord) ||
    !Array.isArray(value.payments) ||
    !value.payments.every(isPaymentRecord)
  ) {
    return false
  }

  const harvestIds = new Set(
    (value.harvestRecords as HarvestRecord[]).map((record) => record.id),
  )
  return (value.payments as PaymentRecord[]).every((payment) =>
    harvestIds.has(payment.harvestId),
  )
}

export type LoadDemoDataResult = {
  data: FarmerDemoData
  warning: 'unavailable' | 'invalid' | null
}

export function loadDemoData(): LoadDemoDataResult {
  let stored: string | null
  try {
    stored = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return { data: createEmptyDemoData(), warning: 'unavailable' }
  }

  if (stored === null) {
    return { data: createEmptyDemoData(), warning: null }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      return { data: createEmptyDemoData(), warning: 'unavailable' }
    }
    return { data: createEmptyDemoData(), warning: 'invalid' }
  }

  if (!isDemoData(parsed)) {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      return { data: createEmptyDemoData(), warning: 'unavailable' }
    }
    return { data: createEmptyDemoData(), warning: 'invalid' }
  }
  return { data: parsed, warning: null }
}

export function saveDemoData(data: FarmerDemoData): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function clearDemoData(): FarmerDemoData {
  window.localStorage.removeItem(STORAGE_KEY)
  return createEmptyDemoData()
}

export function createDemoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
