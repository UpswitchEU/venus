import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ValuationFormData } from '@/types/valuation'
import { useManualFinancialContext } from './useManualFinancialContext'

describe('reported EBITDA context after restoration', () => {
  it('keeps the reported baseline in its actual fiscal year', () => {
    const { result } = renderHook(() =>
      useManualFinancialContext({
        formStoreData: {
          current_year_data: {
            year: 2023,
            revenue: 1000,
            ebitda: 150,
            reported_ebitda: 100,
            ebitda_normalized: true,
          },
        } as ValuationFormData,
        report: null,
        result: null,
      })
    )
    expect(result.current.originalEBITDAByYear).toEqual({ 2023: 100 })
  })
  it('does not fill missing reported EBITDA from the normalized top-level mirror', () => {
    const { result } = renderHook(() =>
      useManualFinancialContext({
        formStoreData: {
          ebitda: 150,
          current_year_data: { year: 2025, revenue: 1000, ebitda: 150, ebitda_normalized: true },
        } as ValuationFormData,
        report: null,
        result: null,
      })
    )
    expect(result.current.originalEBITDAByYear).toEqual({})
    expect(result.current.restoredYearlyFinancials?.[0].ebitda).toBeUndefined()
  })
})
