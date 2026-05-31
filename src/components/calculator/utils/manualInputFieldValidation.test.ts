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
})
