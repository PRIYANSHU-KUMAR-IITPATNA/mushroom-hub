export type FarmerProfile = {
  id: string
  fullName: string
  mobile: string
  state: string
  district: string
  locality: string
  pinCode: string
  registeredAt: string
  mobileVerified: boolean
}

export type BagOrder = {
  id: string
  productId: string
  quantity: number
  fulfillment: 'pickup' | 'delivery'
  deliveryAddress: string | null
  unitPrice: number
  subtotal: number
  status: 'placed'
  createdAt: string
}

export type TrainingRegistration = {
  id: string
  sessionId: string
  registeredAt: string
  status: 'registered'
}

export type HarvestRecord = {
  id: string
  submittedAt: string
  status: 'submitted' | 'accepted' | 'rejected'
  submittedWeightKg?: number | null
  acceptedAt: string | null
  rejectedAt?: string | null
  rejectionReason?: string | null
  acceptedWeightKg: number | null
  grade: 'A' | 'B' | 'C' | null
  ratePerKg: number | null
  auditTrail?: HarvestAuditEntry[]
}

export type HarvestAuditEntry = {
  id: string
  action: 'submitted' | 'accepted' | 'rejected'
  at: string
  previousStatus: 'new' | 'submitted' | 'accepted' | 'rejected'
  newStatus: 'submitted' | 'accepted' | 'rejected'
  note: string | null
}

export type PaymentRecord = {
  id: string
  reference?: string
  harvestId: string
  amount: number
  paidAt: string
  status: 'paid'
}

export type FarmerDemoData = {
  schemaVersion: 1
  profile: FarmerProfile | null
  bagOrders: BagOrder[]
  trainingRegistrations: TrainingRegistration[]
  harvestRecords: HarvestRecord[]
  payments: PaymentRecord[]
}

export type BagProduct = {
  id: string
  name: string
  description: string
  unitPrice: number
}

export type TrainingSession = {
  id: string
  date: string
  location: 'demoLocationOne' | 'demoLocationTwo'
}
