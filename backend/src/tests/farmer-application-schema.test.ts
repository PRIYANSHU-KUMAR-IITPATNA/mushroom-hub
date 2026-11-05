import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  farmerApplicationPatchSchema,
  farmerApplicationReviewSchema,
  farmerApplicationSchema,
} from '../modules/farmer-applications/routes.js'

const validApplication = {
  fullName: 'Asha Devi',
  contactPhone: '9876543210',
  locality: 'Barwadda',
  block: 'Baliapur',
  pinCode: '826004',
  district: 'Dhanbad',
  state: 'Jharkhand',
  preferredLanguage: 'hi',
  consent: true,
}

describe('farmer application validation', () => {
  it('accepts a valid application with optional promotional consent defaulted off', () => {
    const result = farmerApplicationSchema.safeParse(validApplication)
    assert.equal(result.success, true)
    if (result.success) assert.equal(result.data.promotionalConsent, false)
  })

  it('requires a valid Indian contact number and block', () => {
    assert.equal(
      farmerApplicationSchema.safeParse({ ...validApplication, contactPhone: '1234567890' }).success,
      false,
    )
    const withoutBlock = { ...validApplication } as Record<string, unknown>
    delete withoutBlock.block
    assert.equal(farmerApplicationSchema.safeParse(withoutBlock).success, false)
  })

  it('rejects a malformed PIN code and missing required consent', () => {
    assert.equal(
      farmerApplicationSchema.safeParse({ ...validApplication, pinCode: '82604' }).success,
      false,
    )
    const withoutConsent: Record<string, unknown> = { ...validApplication }
    delete withoutConsent.consent
    assert.equal(farmerApplicationSchema.safeParse(withoutConsent).success, false)
  })

  it('allows only permitted fields for applicant changes', () => {
    assert.equal(farmerApplicationPatchSchema.safeParse(validApplication).success, true)
    assert.equal(
      farmerApplicationPatchSchema.safeParse({ ...validApplication, status: 'APPROVED' }).success,
      true,
    )
    const result = farmerApplicationPatchSchema.parse({
      ...validApplication,
      status: 'APPROVED',
    })
    assert.equal('status' in result, false)
  })

  it('requires an applicant-facing message for rejection and changes requests', () => {
    assert.equal(
      farmerApplicationReviewSchema.safeParse({
        status: 'REJECTED',
        confirm: true,
        internalNote: 'Eligibility review completed',
      }).success,
      false,
    )
    assert.equal(
      farmerApplicationReviewSchema.safeParse({
        status: 'CHANGES_REQUESTED',
        confirm: true,
        internalNote: 'Please clarify the locality',
        applicantMessage: 'Please update your locality information.',
      }).success,
      true,
    )
  })
})
