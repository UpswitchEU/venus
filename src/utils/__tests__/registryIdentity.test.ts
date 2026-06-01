import { describe, expect, it } from 'vitest'

import {
  getRegistryIdentityFromRecord,
  hasConflictingRegistryIdentity,
  normalizeRegistryIdentity,
} from '../registryIdentity'

describe('registryIdentity', () => {
  it('normalizes punctuated Belgian and Dutch registry numbers', () => {
    expect(normalizeRegistryIdentity('1033.441.760')).toBe('1033441760')
    expect(normalizeRegistryIdentity(' 1234 AB ')).toBe('1234AB')
  })

  it('reads selected-company identity from business_context aliases', () => {
    expect(
      getRegistryIdentityFromRecord({
        registration_number: '0773.520.560',
        business_context: { kbo_registration_number: '1033.441.760' },
      })
    ).toBe('1033441760')
  })

  it('reads selected-company identity from business_context company_id fallback', () => {
    expect(
      getRegistryIdentityFromRecord({
        registration_number: '0773.520.560',
        business_context: { company_id: '1033.441.760' },
      })
    ).toBe('1033441760')
  })

  it('reads selected-company identity from camelCase businessContext aliases', () => {
    expect(
      getRegistryIdentityFromRecord({
        registration_number: '0773.520.560',
        businessContext: { kboNumber: '1033.441.760' },
      })
    ).toBe('1033441760')
  })

  it('reads restored business-card identity from nested session envelopes', () => {
    expect(
      getRegistryIdentityFromRecord({
        _businessInfo: { registrationNumber: '1033.441.760' },
      })
    ).toBe('1033441760')

    expect(
      getRegistryIdentityFromRecord({
        companyInfo: { kvkNumber: '12345678' },
      })
    ).toBe('12345678')

    expect(
      getRegistryIdentityFromRecord({
        kboData: { enterpriseNumber: '1033.441.760' },
      })
    ).toBe('1033441760')
  })

  it('detects stale session registry conflicts', () => {
    expect(
      hasConflictingRegistryIdentity(
        { business_context: { kbo_registration: '1033.441.760' } },
        { kbo_number: '0773.520.560' }
      )
    ).toBe(true)
  })
})
