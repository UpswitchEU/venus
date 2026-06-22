import { describe, expect, it } from 'vitest'

import {
  buildOptionalSessionGapFillPatch,
  sessionEnvelopeHasIdentitySignals,
} from '../mergeOptionalSessionPrefillFields'

describe('buildOptionalSessionGapFillPatch', () => {
  it('fills registry columns from nested _businessInfo into vacant slots', () => {
    const patch = buildOptionalSessionGapFillPatch(
      { _businessInfo: { company_name: 'Nested BV', kbo_number: '0123456749' } },
      {}
    )
    expect(patch.company_name).toBe('Nested BV')
    expect(patch.kbo_number).toBe('0123456749')
  })

  it('does not overwrite populated identity fields', () => {
    const patch = buildOptionalSessionGapFillPatch(
      { _businessInfo: { company_name: 'Other', kbo_number: '0999999999' } },
      { company_name: 'Mine', kbo_number: '0111111111' }
    )
    expect(patch.company_name).toBeUndefined()
    expect(patch.kbo_number).toBeUndefined()
  })

  it('drops stale business-card fields when registry identity conflicts', () => {
    const patch = buildOptionalSessionGapFillPatch(
      {
        company_name: 'Old Restaurant',
        kbo_number: '0773.520.560',
        business_description: 'Legacy restaurant dossier',
        taxonomy: 'horeca',
        locale: 'nl-BE',
        founding_year: 1998,
        number_of_employees: 42,
        business_type_id: 'restaurant',
        industry: 'Food & Beverage',
        dcf_wacc_pct: 9.25,
      },
      {
        company_name: 'Upswitch',
        business_context: { kbo_registration: '1033.441.760' },
      }
    )

    expect(patch.company_name).toBeUndefined()
    expect(patch.kbo_number).toBeUndefined()
    expect(patch.business_description).toBeUndefined()
    expect(patch.taxonomy).toBeUndefined()
    expect(patch.locale).toBeUndefined()
    expect(patch.founding_year).toBeUndefined()
    expect(patch.number_of_employees).toBeUndefined()
    expect(patch.business_type_id).toBeUndefined()
    expect(patch.industry).toBeUndefined()
    expect(patch.dcf_wacc_pct).toBe(9.25)
  })

  it('drops stale nested business-card fields when only camelCase registration differs', () => {
    const patch = buildOptionalSessionGapFillPatch(
      {
        _businessInfo: {
          companyName: 'Old Restaurant',
          registrationNumber: '0773.520.560',
          business_type_id: 'restaurant',
        },
        dcf_wacc_pct: 9.25,
      },
      {
        company_name: 'Upswitch',
        businessContext: { kboNumber: '1033.441.760' },
      }
    )

    expect(patch.company_name).toBeUndefined()
    expect(patch.registration_number).toBeUndefined()
    expect(patch.business_type_id).toBeUndefined()
    expect(patch.dcf_wacc_pct).toBe(9.25)
  })
})

describe('sessionEnvelopeHasIdentitySignals', () => {
  it('true when company_name lives under _businessInfo only', () => {
    expect(
      sessionEnvelopeHasIdentitySignals({
        _businessInfo: { company_name: 'Acme BV' },
      })
    ).toBe(true)
  })

  it('true when KBO lives under card only', () => {
    expect(sessionEnvelopeHasIdentitySignals({ _businessInfo: { kbo_number: '0123456749' } })).toBe(
      true
    )
  })

  it('true when KVK or registration aliases live under card only', () => {
    expect(
      sessionEnvelopeHasIdentitySignals({ _businessInfo: { registrationNumber: '12345678' } })
    ).toBe(true)
    expect(sessionEnvelopeHasIdentitySignals({ companyInfo: { kvkNumber: '87654321' } })).toBe(true)
  })

  it('false when envelope has no identity cues', () => {
    expect(sessionEnvelopeHasIdentitySignals({})).toBe(false)
    expect(sessionEnvelopeHasIdentitySignals({ _businessInfo: {} })).toBe(false)
  })
})
