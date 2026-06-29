// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import { useManualDcfProjectionModelSync } from './useManualDcfProjectionModelSync'

type Updater = (current: ManualValuationFormData) => ManualValuationFormData

function forecastRows(formData: ManualValuationFormData): YearlyFinancials[] {
  return formData.yearlyFinancials.filter((row) => row.isForecast)
}

function forecastFor(formData: ManualValuationFormData, year: string): YearlyFinancials {
  const row = formData.yearlyFinancials.find((candidate) => String(candidate.year) === year)
  if (!row) throw new Error(`Missing year ${year}`)
  return row
}

describe('useManualDcfProjectionModelSync', () => {
  it('re-syncs model-generated forecast rows when the historical revenue base changes', async () => {
    let formData = {
      businessType: 'consultancy',
      industry: 'professional_services',
      dcf_revenue_growth_pct: 5,
      dcf_ebitda_margin_pct: 10,
      dcf_capex_pct: 2,
      dcf_da_pct: 2,
      dcf_nwc_pct: 1.5,
      dcf_tax_rate_pct: 25,
      yearlyFinancials: [
        { year: '2025', revenue: 100_000, ebitda: 10_000 },
        {
          year: '2026',
          revenue: 105_000,
          ebitda: 10_500,
          capex: 2_100,
          depreciation: 2_100,
          nwc_change: 75,
          isForecast: true,
        },
      ] as YearlyFinancials[],
    } as ManualValuationFormData

    const setFormData = vi.fn((arg: ManualValuationFormData | Updater) => {
      formData = typeof arg === 'function' ? (arg as Updater)(formData) : arg
    })

    const { rerender } = renderHook(
      ({ currentFormData }: { currentFormData: ManualValuationFormData }) =>
        useManualDcfProjectionModelSync({
          formData: currentFormData,
          setFormData,
          hasDcfSelected: true,
          dcfForecastRows: forecastRows(currentFormData),
        }),
      { initialProps: { currentFormData: formData } }
    )

    await waitFor(() => {
      expect(setFormData).toHaveBeenCalled()
    })

    formData = {
      ...formData,
      yearlyFinancials: [
        { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
        forecastFor(formData, '2026'),
      ] as YearlyFinancials[],
    }

    rerender({ currentFormData: formData })

    await waitFor(() => {
      expect(forecastFor(formData, '2026')).toMatchObject({
        revenue: 1_050_000,
        ebitda: 105_000,
      })
    })
  })
})
