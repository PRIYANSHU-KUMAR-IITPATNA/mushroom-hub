import assert from 'node:assert/strict'
import { HarvestDecisionStatus, Prisma, QualityGrade } from '@prisma/client'
import { describe, it } from 'node:test'
import {
  calculateFarmerPayable,
  deriveHarvestDecisionStatus,
  gradeQuantitiesMatchInspection,
  selectEffectiveRate,
  type EffectiveFarmerRate,
} from '../modules/harvests/acceptance.js'

const policy: EffectiveFarmerRate = {
  id: 'policy-1',
  reference: 'RATE-A-1',
  grade: QualityGrade.A,
  ratePerKg: new Prisma.Decimal('10.25'),
  effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
  effectiveTo: new Date('2026-02-01T00:00:00.000Z'),
}

describe('farmer harvest payable calculation', () => {
  it('uses decimal arithmetic and rounds half up to INR minor units', () => {
    assert.equal(
      calculateFarmerPayable(new Prisma.Decimal('1.005'), new Prisma.Decimal('1.00')).toFixed(2),
      '1.01',
    )
  })

  it('retains the approved rate and effective policy boundaries', () => {
    assert.equal(
      selectEffectiveRate([policy], QualityGrade.A, new Date('2026-01-01T00:00:00.000Z')).reference,
      'RATE-A-1',
    )
    assert.throws(
      () => selectEffectiveRate([policy], QualityGrade.A, new Date('2026-02-01T00:00:00.000Z')),
      /No approved farmer purchase rate policy/,
    )
  })

  it('fails closed when no policy or overlapping policies apply', () => {
    const at = new Date('2026-01-15T00:00:00.000Z')
    assert.throws(() => selectEffectiveRate([], QualityGrade.A, at), /No approved/)
    assert.throws(() => selectEffectiveRate([policy, policy], QualityGrade.A, at), /Multiple approved/)
  })

  it('classifies acceptance from accepted versus inspected quantities', () => {
    assert.equal(
      deriveHarvestDecisionStatus(new Prisma.Decimal(0), new Prisma.Decimal(5)),
      HarvestDecisionStatus.REJECTED,
    )
    assert.equal(
      deriveHarvestDecisionStatus(new Prisma.Decimal(2), new Prisma.Decimal(5)),
      HarvestDecisionStatus.PARTIALLY_ACCEPTED,
    )
    assert.equal(
      deriveHarvestDecisionStatus(new Prisma.Decimal(5), new Prisma.Decimal(5)),
      HarvestDecisionStatus.ACCEPTED,
    )
  })

  it('requires accepted and rejected quantities to account for the inspected weight', () => {
    const inspected = new Prisma.Decimal('5.000')
    assert.equal(
      gradeQuantitiesMatchInspection(new Prisma.Decimal('3.250'), new Prisma.Decimal('1.750'), inspected),
      true,
    )
    assert.equal(
      gradeQuantitiesMatchInspection(new Prisma.Decimal('3.250'), new Prisma.Decimal('1.700'), inspected),
      false,
    )
  })
})
