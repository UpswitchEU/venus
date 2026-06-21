import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import {
  type ManualInputAssistantPatch,
  useManualInputAssistantPatchSync,
} from './useManualInputAssistantPatchSync'

type FormUpdater = (current: ManualValuationFormData) => ManualValuationFormData

function makeForm(yearlyFinancials: YearlyFinancials[]): ManualValuationFormData {
  return {
    businessType: 'software',
    companyName: 'Acme BV',
    country: 'BE',
    industry: 'technology',
    ownerManagers: 1,
    yearlyFinancials,
  } as ManualValuationFormData
}

describe('useManualInputAssistantPatchSync', () => {
  it('applies an assistant financial-year patch once per patch id', () => {
    const setFormData = vi.fn()
    const patch: ManualInputAssistantPatch = {
      id: 'patch-1',
      type: 'select_financial_years',
      years: [2024, 2022],
    }

    const { rerender } = renderHook(
      ({ assistantPatch }) =>
        useManualInputAssistantPatchSync({
          assistantPatch,
          setFormData,
        }),
      { initialProps: { assistantPatch: patch } }
    )

    expect(setFormData).toHaveBeenCalledTimes(1)
    const updater = setFormData.mock.calls[0][0] as FormUpdater
    expect(
      updater(
        makeForm([
          { year: '2024', revenue: 100, ebitda: 20 },
          { year: '2023', revenue: 90, ebitda: 18 },
          { year: '2022', revenue: 80, ebitda: 16 },
          { year: '2025', revenue: 0, ebitda: 0, isForecast: true },
        ])
      ).yearlyFinancials
    ).toEqual([
      { year: '2024', revenue: 100, ebitda: 20 },
      { year: '2022', revenue: 80, ebitda: 16 },
      { year: '2025', revenue: 0, ebitda: 0, isForecast: true },
    ])

    rerender({ assistantPatch: patch })
    expect(setFormData).toHaveBeenCalledTimes(1)

    rerender({
      assistantPatch: {
        ...patch,
        id: 'patch-2',
      },
    })
    expect(setFormData).toHaveBeenCalledTimes(2)
  })

  it('applies assistant balance patches to the current year data', () => {
    const setFormData = vi.fn()

    renderHook(() =>
      useManualInputAssistantPatchSync({
        assistantPatch: {
          id: 'balance-1',
          type: 'set_current_year_balance',
          balance: {
            cash: 5000,
            current_liabilities: 12000,
            total_debt: 30000,
          },
        },
        setFormData,
      })
    )

    expect(setFormData).toHaveBeenCalledTimes(1)
    const updater = setFormData.mock.calls[0][0] as FormUpdater
    const next = updater({
      ...makeForm([{ year: '2024', revenue: 100, ebitda: 20 }]),
      current_year_data: { year: 2024, revenue: 100, ebitda: 20 },
    } as ManualValuationFormData)

    expect(next.current_year_data).toMatchObject({
      cash: 5000,
      current_liabilities: 12000,
      total_debt: 30000,
    })
    expect(next.yearlyFinancials[0]).toMatchObject({
      cash: 5000,
      current_liabilities: 12000,
      total_debt: 30000,
    })
  })
})
