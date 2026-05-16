// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import { useManualDcfForecastController } from './useManualDcfForecastController'

type Updater = (current: ManualValuationFormData) => ManualValuationFormData

function makeForm(overrides: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  return {
    businessType: 'software',
    industry: 'technology',
    yearlyFinancials: [
      { year: '2024', revenue: 1_200_000, ebitda: 240_000 },
      { year: '2023', revenue: 1_000_000, ebitda: 180_000 },
      { year: '2025', revenue: 0, ebitda: 0, isForecast: true },
      { year: '2026', revenue: 0, ebitda: 0, isForecast: true },
    ] as YearlyFinancials[],
    ...overrides,
  } as ManualValuationFormData
}

function setup(overrides: Partial<ManualValuationFormData> = {}) {
  const formStateRef = { current: makeForm(overrides) }
  const setFormData = vi.fn((arg: ManualValuationFormData | Updater) => {
    formStateRef.current = typeof arg === 'function' ? (arg as Updater)(formStateRef.current) : arg
  })
  const translate = vi.fn((key: string) => key)

  const sortedYearlyFinancials = [...formStateRef.current.yearlyFinancials].sort(
    (a, b) => Number(b.year) - Number(a.year)
  )

  const { result } = renderHook(() =>
    useManualDcfForecastController({
      formData: formStateRef.current,
      setFormData,
      hasDcfSelected: true,
      importBatchData: null,
      selectedBusinessCategory: 'technology',
      sortedYearlyFinancials,
      translate,
    })
  )

  return { formStateRef, result, setFormData, translate }
}

describe('useManualDcfForecastController', () => {
  it('seeds blank DCF globals when DCF forecast rows are active', async () => {
    const { formStateRef } = setup()

    await waitFor(() => {
      expect(formStateRef.current.dcf_wacc_pct).toBeDefined()
      expect(formStateRef.current.dcf_revenue_growth_pct).toBeDefined()
      expect(formStateRef.current.dcf_ebitda_margin_pct).toBeDefined()
      expect(formStateRef.current.dcf_capex_pct).toBeDefined()
      expect(formStateRef.current.dcf_da_pct).toBeDefined()
      expect(formStateRef.current.dcf_nwc_pct).toBeDefined()
      expect(formStateRef.current.dcf_tax_rate_pct).toBeDefined()
    })
  })

  it('switches forecast rows to FCFF-only mode and locks terminal value to Gordon growth', () => {
    const { formStateRef, result } = setup({
      dcf_terminal_value_method: 'exit_multiple',
      dcf_exit_multiple: 6,
      dcf_da_pct: 3,
      dcf_capex_pct: 4,
      dcf_nwc_pct: 1,
      dcf_tax_rate_pct: 25,
      yearlyFinancials: [
        { year: '2024', revenue: 1_200_000, ebitda: 240_000 },
        { year: '2025', revenue: 1_300_000, ebitda: 260_000, isForecast: true },
      ] as YearlyFinancials[],
    })

    act(() => {
      result.current.handleDcfInputModeChange('fcff_only')
    })

    expect(formStateRef.current.dcf_input_mode).toBe('fcff_only')
    expect(formStateRef.current.dcf_terminal_value_method).toBe('perpetual_growth')
    const forecast = formStateRef.current.yearlyFinancials.find((row) => row.isForecast)
    expect(forecast?.revenue).toBe(0)
    expect(forecast?.ebitda).toBe(0)
    expect(forecast?.free_cash_flow).toEqual(expect.any(Number))
  })
})
