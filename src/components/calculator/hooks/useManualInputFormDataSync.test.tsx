import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import { useManualInputFormDataSync } from './useManualInputFormDataSync'

describe('useManualInputFormDataSync', () => {
  it('syncs real-estate and advisor controls into live manual state', async () => {
    const latestCompleteYearlyFinancial: YearlyFinancials = {
      year: '2025',
      revenue: 1_000_000,
      ebitda: 100_000,
    }
    const formData = {
      companyName: 'Sandra Lemmens',
      businessType: 'Healthcare',
      business_model: 'services',
      country: 'BE',
      yearFounded: '2021',
      ownerManagers: 1,
      fteEmployees: 5,
      yearlyFinancials: [latestCompleteYearlyFinancial],
      real_estate_treatment: 'included',
      exclude_real_estate: false,
      real_estate_market_value: 900_000,
      real_estate_book_value: 650_000,
      estimated_market_rent: 42_000,
      multiple_calibration_adjustment: -0.75,
      multiple_calibration_note: 'Supplier concentration',
      effective_multiple_override: 6,
      effective_multiple_override_note: 'Strategic buyer premium',
      multiple_type_weights: { ev_ebitda: 50, ev_revenue: 40, pe: 10 },
      advisor_discount_weights: { size_discount: 0.5, liquidity_discount: 1.25 },
      risk_analysis_enabled: false,
      discount_floor_factor: 0.4,
      historical_ebitda_weighting_mode: 'weighted',
      historical_ebitda_weights: { 2023: 10, 2024: 30, 2025: 60 },
      show_enterprise_to_equity_bridge: false,
      owner_salary_addback: 80_000,
      owner_role: 'working',
      nav_real_estate_book_value: 650_000,
      nav_real_estate_appraisal_value: 900_000,
      nav_per_asset_tax_rates: { real_estate: 25 },
      nav_equipment_revaluation: { original_cost: 200_000, tax_book_value: 40_000 },
      deal_type: 'compare',
      liq_headcount: 8,
      liq_ao_buildings: 900_000,
      fiscal_acquisition_cost: 750_000,
      fiscal_anchor_4_value: 0,
      rev_capitalized_rd_amount: 85_000,
    } as ManualValuationFormData
    const onFormDataChange = vi.fn()
    const formDataRef = { current: {} as Record<string, unknown> }

    renderHook(() =>
      useManualInputFormDataSync({
        formData,
        latestCompleteYearlyFinancial,
        onFormDataChange,
        storeBusinessModel: 'services',
        formDataRef,
      })
    )

    expect(formDataRef.current).toMatchObject({
      real_estate_treatment: 'included',
      exclude_real_estate: false,
      real_estate_market_value: 900_000,
      real_estate_book_value: 650_000,
      estimated_market_rent: 42_000,
      effective_multiple_override: 6,
      effective_multiple_override_note: 'Strategic buyer premium',
      multiple_type_weights: { ev_ebitda: 50, ev_revenue: 40, pe: 10 },
      advisor_discount_weights: { size_discount: 0.5, liquidity_discount: 1.25 },
      risk_analysis_enabled: false,
      discount_floor_factor: 0.4,
      nav_real_estate_appraisal_value: 900_000,
      deal_type: 'compare',
      liq_headcount: 8,
      fiscal_anchor_4_value: 0,
      rev_capitalized_rd_amount: 85_000,
    })

    await waitFor(() => expect(onFormDataChange).toHaveBeenCalled())
    expect(onFormDataChange.mock.calls.at(-1)?.[0]).toMatchObject({
      real_estate_treatment: 'included',
      exclude_real_estate: false,
      real_estate_market_value: 900_000,
      real_estate_book_value: 650_000,
      estimated_market_rent: 42_000,
      multiple_calibration_adjustment: -0.75,
      multiple_calibration_note: 'Supplier concentration',
      effective_multiple_override: 6,
      effective_multiple_override_note: 'Strategic buyer premium',
      multiple_type_weights: { ev_ebitda: 50, ev_revenue: 40, pe: 10 },
      advisor_discount_weights: { size_discount: 0.5, liquidity_discount: 1.25 },
      risk_analysis_enabled: false,
      discount_floor_factor: 0.4,
      historical_ebitda_weighting_mode: 'weighted',
      historical_ebitda_weights: { 2023: 10, 2024: 30, 2025: 60 },
      show_enterprise_to_equity_bridge: false,
      owner_salary_addback: 80_000,
      owner_role: 'working',
      nav_real_estate_book_value: 650_000,
      nav_real_estate_appraisal_value: 900_000,
      nav_per_asset_tax_rates: { real_estate: 25 },
      nav_equipment_revaluation: { original_cost: 200_000, tax_book_value: 40_000 },
      deal_type: 'compare',
      liq_headcount: 8,
      liq_ao_buildings: 900_000,
      fiscal_acquisition_cost: 750_000,
      fiscal_anchor_4_value: 0,
      rev_capitalized_rd_amount: 85_000,
    })
  })

  it('keeps the live submit ref on the latest complete financial year, not a newer placeholder', () => {
    const latestCompleteYearlyFinancial: YearlyFinancials = {
      year: '2024',
      revenue: 900_000,
      ebitda: 90_000,
    }
    const formData = {
      companyName: 'Upswitch',
      businessType: 'fintech-lending-credit',
      country: 'BE',
      ownerManagers: 1,
      fteEmployees: 5,
      current_year_data: { year: 2025, revenue: 0, ebitda: 0 },
      yearlyFinancials: [
        { year: '2025', revenue: 0, ebitda: 0 },
        latestCompleteYearlyFinancial,
        { year: '2023', revenue: 800_000, ebitda: 80_000 },
      ],
    } as ManualValuationFormData
    const formDataRef = { current: {} as Record<string, unknown> }

    renderHook(() =>
      useManualInputFormDataSync({
        formData,
        latestCompleteYearlyFinancial,
        formDataRef,
      })
    )

    expect(formDataRef.current.current_year_data).toMatchObject({
      year: 2024,
      revenue: 900_000,
      ebitda: 90_000,
    })
    expect(formDataRef.current.businessType).toBe('fintech-lending')
  })
})
