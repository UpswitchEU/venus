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

  it('accepts restored canonical business type ids for SME methods', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Upswitch',
          businessType: '',
          businessTypeId: 'fintech-lending-credit',
          yearlyFinancials: [{ year: '2025', revenue: 1_000_000, ebitda: 100_000 }],
        },
        'upswitch_adaptive'
      )
    ).toBeNull()
  })

  it('accepts restored business type codes for SME methods', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Upswitch',
          businessType: '',
          businessTypeCode: 'fintech-lending-credit',
          yearlyFinancials: [{ year: '2025', revenue: 1_000_000, ebitda: 100_000 }],
        },
        'upswitch_adaptive'
      )
    ).toBeNull()
  })

  it('accepts restored snake_case business type ids for SME methods', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Upswitch',
          businessType: '',
          business_type_id: 'fintech-lending-credit',
          yearlyFinancials: [{ year: '2025', revenue: 1_000_000, ebitda: 100_000 }],
        },
        'upswitch_adaptive'
      )
    ).toBeNull()
  })

  it('accepts restored multi-segment business type identity for SME methods', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Upswitch',
          businessType: '',
          business_type_segments: [
            { business_type_id: 'accounting' },
            { business_type_id: 'tax-advisory' },
          ],
          yearlyFinancials: [{ year: '2025', revenue: 1_000_000, ebitda: 100_000 }],
        },
        'upswitch_adaptive'
      )
    ).toBeNull()
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

  it('requires canonical business type identity for venture-path methods', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: 'startup',
          yearlyFinancials: [],
        },
        'startup_valuation'
      )
    ).toBe('businessTypeMissing')
  })

  it('accepts multi-segment business type identity for venture-path methods', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: 'startup',
          business_type_segments: [
            { business_type_id: 'saas' },
            { business_type_id: 'marketplace' },
          ],
          yearlyFinancials: [],
        },
        'startup_valuation'
      )
    ).toBeNull()
  })

  it('skips SME financial blockers for venture-path methods after business type is resolved', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: '',
          businessTypeId: 'saas',
          yearlyFinancials: [],
        },
        'startup_valuation'
      )
    ).toBeNull()
  })

  it('blocks explicit DCF with fewer than three closed fiscal years', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: 'Consulting',
          yearlyFinancials: [{ year: '2025', revenue: 100, ebitda: 10 }],
        },
        'dcf'
      )
    ).toBe('dcfNotReady')
  })

  it('passes explicit DCF with three closed fiscal years', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: 'Consulting',
          yearlyFinancials: [
            { year: '2025', revenue: 100, ebitda: 10 },
            { year: '2024', revenue: 90, ebitda: 9 },
            { year: '2023', revenue: 80, ebitda: 8 },
          ],
        },
        'dcf'
      )
    ).toBeNull()
  })

  it('passes one-year SME submissions with zero historical placeholders', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Upswitch',
          businessType: 'Financial Services',
          yearlyFinancials: [
            { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
            { year: '2024', revenue: 0, ebitda: 0 },
            { year: '2023', revenue: 0, ebitda: 0 },
          ],
        },
        'upswitch_adaptive'
      )
    ).toBeNull()
  })

  it('passes the exact two-year LGS case through Adaptive', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'LGS workshop',
          businessType: 'Reclamebureau',
          yearlyFinancials: [
            { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
            { year: '2024', revenue: 900_000, ebitda: 100_000 },
            { year: '2023', revenue: 0, ebitda: 0 },
          ],
        },
        'upswitch_adaptive'
      )
    ).toBeNull()
  })

  it('blocks an Adaptive synthesis carrying a positive DCF weight when not ready', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'LGS workshop',
          businessType: 'Reclamebureau',
          user_weights: { dcf: 0.4, ebitda_multiple: 0.6 },
          yearlyFinancials: [
            { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
            { year: '2024', revenue: 900_000, ebitda: 100_000 },
          ],
        },
        'upswitch_adaptive'
      )
    ).toBe('dcfNotReady')
  })

  it('blocks advisor-entered DCF assumptions with fewer than three actual years', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: 'Consulting',
          dcf_exit_multiple: 4.5,
          yearlyFinancials: [
            { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
            { year: '2024', revenue: 900_000, ebitda: 90_000 },
          ],
        },
        'upswitch_adaptive'
      )
    ).toBe('dcfNotReady')
  })

  it('allows explicit FCFF projections with fewer than three actual years', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'LGS workshop',
          businessType: 'Reclamebureau',
          dcf_input_mode: 'fcff_only',
          yearlyFinancials: [
            { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
            {
              year: '2026',
              revenue: 0,
              ebitda: 0,
              free_cash_flow: 125_000,
              isForecast: true,
            },
          ],
        },
        'dcf'
      )
    ).toBeNull()
  })
})
