import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import {
  type UseAdjustedNavPrefillCoordinatorParams,
  useAdjustedNavPrefillCoordinator,
} from './useAdjustedNavPrefillCoordinator'

const latestCompleteYearlyFinancial: YearlyFinancials = {
  year: '2024',
  revenue: 1_000_000,
  ebitda: 150_000,
}

function formData(partial: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  return {
    companyName: 'DemoCo',
    businessType: 'industrial',
    industry: 'manufacturing',
    country: 'BE',
    yearFounded: '2010',
    businessStructure: 'BV',
    ownerManagers: 1,
    fteEmployees: undefined,
    yearlyFinancials: [],
    ...partial,
  }
}

function params(
  partial: Partial<UseAdjustedNavPrefillCoordinatorParams> = {}
): UseAdjustedNavPrefillCoordinatorParams {
  return {
    navIsActiveSection: true,
    formData: formData({ real_estate_book_value: 500_000 }),
    latestCompleteYearlyFinancial,
    onFieldChange: vi.fn(),
    onAnyFieldChange: vi.fn(),
    ...partial,
  }
}

describe('useAdjustedNavPrefillCoordinator', () => {
  it('does nothing while the NAV section is inactive', () => {
    const onFieldChange = vi.fn()
    const onAnyFieldChange = vi.fn()

    renderHook(() =>
      useAdjustedNavPrefillCoordinator(
        params({ navIsActiveSection: false, onFieldChange, onAnyFieldChange })
      )
    )

    expect(onFieldChange).not.toHaveBeenCalled()
    expect(onAnyFieldChange).not.toHaveBeenCalled()
  })

  it('applies NAV defaults and merges nested equipment defaults into one write', () => {
    const onFieldChange = vi.fn()
    const onAnyFieldChange = vi.fn()

    renderHook(() => useAdjustedNavPrefillCoordinator(params({ onFieldChange, onAnyFieldChange })))

    expect(onFieldChange).toHaveBeenCalledWith('nav_tax_latency_pct', 25)
    expect(onFieldChange).toHaveBeenCalledWith('nav_real_estate_book_value', 500_000)
    expect(onFieldChange).toHaveBeenCalledWith('deal_buyer_discount_rate_pct', 10)
    expect(onFieldChange).toHaveBeenCalledWith('deal_registration_duty_pct', 12.5)
    expect(onAnyFieldChange).toHaveBeenCalledTimes(1)
    expect(onAnyFieldChange).toHaveBeenCalledWith('nav_equipment_revaluation', {
      acquisition_year: 2018,
      economic_useful_life_years: 10,
    })
  })

  it('does not overwrite values the user already typed', () => {
    const onFieldChange = vi.fn()
    const onAnyFieldChange = vi.fn()

    renderHook(() =>
      useAdjustedNavPrefillCoordinator(
        params({
          formData: formData({
            country: 'BE',
            real_estate_book_value: 500_000,
            nav_tax_latency_pct: 21,
            nav_real_estate_book_value: 420_000,
            nav_equipment_revaluation: {
              acquisition_year: 2020,
              economic_useful_life_years: 8,
            },
            deal_buyer_discount_rate_pct: 11,
            deal_registration_duty_pct: 9,
          }),
          onFieldChange,
          onAnyFieldChange,
        })
      )
    )

    expect(onFieldChange).not.toHaveBeenCalled()
    expect(onAnyFieldChange).not.toHaveBeenCalled()
  })

  it('exposes provenance only while current form values still match applied defaults', () => {
    const onFieldChange = vi.fn()
    const onAnyFieldChange = vi.fn()
    const initialParams = params({ onFieldChange, onAnyFieldChange })

    const { result, rerender } = renderHook(
      (p: UseAdjustedNavPrefillCoordinatorParams) => useAdjustedNavPrefillCoordinator(p),
      { initialProps: initialParams }
    )

    expect(result.current.navPrefillProvenance.nav_tax_latency_pct).toBeUndefined()

    act(() =>
      rerender({
        ...initialParams,
        formData: formData({
          country: 'BE',
          real_estate_book_value: 500_000,
          nav_tax_latency_pct: 25,
          nav_real_estate_book_value: 500_000,
          nav_equipment_revaluation: {
            acquisition_year: 2018,
            economic_useful_life_years: 10,
          },
          deal_buyer_discount_rate_pct: 10,
          deal_registration_duty_pct: 12.5,
        }),
      })
    )

    expect(result.current.navPrefillProvenance.nav_tax_latency_pct?.source).toBe('country_default')
    expect(result.current.navPrefillProvenance.nav_equipment_acquisition_year?.source).toBe(
      'sector_default'
    )

    act(() =>
      rerender({
        ...initialParams,
        formData: formData({
          country: 'BE',
          real_estate_book_value: 500_000,
          nav_tax_latency_pct: 24,
          nav_real_estate_book_value: 500_000,
          nav_equipment_revaluation: {
            acquisition_year: 2018,
            economic_useful_life_years: 10,
          },
          deal_buyer_discount_rate_pct: 10,
          deal_registration_duty_pct: 12.5,
        }),
      })
    )

    expect(result.current.navPrefillProvenance.nav_tax_latency_pct).toBeUndefined()
  })
})
