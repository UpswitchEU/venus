// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { getManualSubmitValidationIssue } from './manualSubmitValidation'

describe('getManualSubmitValidationIssue', () => {
  it('requires company name for every method', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: ' ',
          businessType: 'Consulting',
          yearlyFinancials: [{ year: '2025', revenue: 100, ebitda: 10 }],
        },
        'startup_valuation'
      )
    ).toBe('companyNameMissing')
  })

  it('requires business type for SME methods', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: '',
          yearlyFinancials: [{ year: '2025', revenue: 100, ebitda: 10 }],
        },
        'dcf'
      )
    ).toBe('businessTypeMissing')
  })

  it('requires a complete financial year for SME methods', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: 'Consulting',
          yearlyFinancials: [{ year: '2025', revenue: 0, ebitda: 0 }],
        },
        'dcf'
      )
    ).toBe('financialDataIncomplete')
  })

  it('skips SME financial blockers for venture-path methods', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: '',
          yearlyFinancials: [],
        },
        'startup_valuation'
      )
    ).toBeNull()
  })

  it('passes complete SME submissions', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: 'Consulting',
          yearlyFinancials: [{ year: '2025', revenue: 100, ebitda: 10 }],
        },
        'dcf'
      )
    ).toBeNull()
  })
})
