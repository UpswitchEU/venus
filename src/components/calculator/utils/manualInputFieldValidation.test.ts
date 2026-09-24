import { describe, expect, it } from 'vitest'
import type { ManualValuationFormData } from '../../../types/valuation'
import { buildManualInputFieldValidation } from './manualInputFieldValidation'

const translate = (key: string) => key

describe('buildManualInputFieldValidation', () => {
  it('does not block one-year operating companies with zero historical placeholders', () => {
    const result = buildManualInputFieldValidation(
      {
        companyName: 'Upswitch',
        businessType: 'Financial Services',
        ownerManagers: 1,
        fteEmployees: 5,
        yearlyFinancials: [
          { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
          { year: '2024', revenue: 0, ebitda: 0 },
          { year: '2023', revenue: 0, ebitda: 0 },
        ],
      } as ManualValuationFormData,
      translate,
      2026
    )

    expect(result.errors).toEqual({})
    expect(result.hasErrors).toBe(false)
  })

  // The request drops the headcount for sole traders, so demanding one blocked Calculate
  // for nothing.
  it('does not require a headcount from a sole trader', () => {
    const result = buildManualInputFieldValidation(
      {
        companyName: 'Acme',
        businessType: 'Consulting',
        businessStructure: 'sole-trader',
        ownerManagers: 1,
        fteEmployees: undefined,
        yearlyFinancials: [{ year: '2025', revenue: 100_000, ebitda: 20_000 }],
      } as ManualValuationFormData,
      translate,
      2026
    )

    expect(result.errors.fteEmployees).toBeUndefined()
    expect(result.hasErrors).toBe(false)
  })

  it('still requires a headcount from a company with owner-managers', () => {
    const result = buildManualInputFieldValidation(
      {
        companyName: 'Acme',
        businessType: 'Consulting',
        businessStructure: 'bv',
        ownerManagers: 1,
        fteEmployees: undefined,
        yearlyFinancials: [{ year: '2025', revenue: 100_000, ebitda: 20_000 }],
      } as ManualValuationFormData,
      translate,
      2026
    )

    expect(result.errors.fteEmployees).toBe('validation.fteRequired')
  })
})
