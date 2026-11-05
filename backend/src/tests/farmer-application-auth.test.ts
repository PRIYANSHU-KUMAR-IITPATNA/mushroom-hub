import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeEmail, normalizeIndianPhone } from '../modules/farmer-applications/auth.js'

describe('Indian mobile number normalization', () => {
  it('normalizes valid ten-digit numbers to E.164', () => {
    assert.equal(normalizeIndianPhone('9876543210'), '+919876543210')
    assert.equal(normalizeIndianPhone('+91 98765-43210'), '+919876543210')
  })

  describe('email normalization', () => {
    it('trims whitespace and normalizes case', () => {
      assert.equal(normalizeEmail('  Farmer@Example.Test '), 'farmer@example.test')
    })
  })

  it('rejects invalid prefixes, country codes, and lengths', () => {
    assert.equal(normalizeIndianPhone('5876543210'), undefined)
    assert.equal(normalizeIndianPhone('+1 9876543210'), undefined)
    assert.equal(normalizeIndianPhone('987654321'), undefined)
  })
})
