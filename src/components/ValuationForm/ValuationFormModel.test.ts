import { describe, expect, it, vi } from 'vitest'
import type { ValuationFormData, ValuationRequest } from '../../types/valuation'
import type { NormalizationItem } from '../calculator/UnifiedNormalizationTypes'
import {
  hasRecentAcceptedNormalizations,
  hasValuationFormChangesSinceVersion,
} from './ValuationFormModel'

function normalization(overrides: Partial<NormalizationItem> = {}): NormalizationItem {
  return {
    id: 'norm-1',
    ledgerCode: '620000',
    ledgerName: 'Management salary',
    category: 'salary',
    type: 'add',
    value: 10_000,
    adjustment: 10_000,
    source: 'manual',
    status: 'accepted',
    applyAllYears: false,
    year: 2024,
    ...overrides,
  }
}

function valuationData(overrides: Partial<ValuationFormData> = {}): ValuationFormData {
  return {
    company_name: 'Acme BV',
    country_code: 'BE',
    industry: 'services',
    business_model: 'services',
    founding_year: 2018,
    revenue: 1_000_000,
    ebitda: 120_000,
    number_of_employees: 10,
    number_of_owners: 1,
    historical_years_data: [{ year: 2024, revenue: 900_000, ebitda: 100_000 }],
    ...overrides,
  }
}

describe('ValuationFormModel', () => {
  it('detects accepted normalizations in the active three-year version window', () => {
    expect(
      hasRecentAcceptedNormalizations({
        normalizationItems: [
          normalization({ status: 'pending', year: 2024 }),
          normalization({ status: 'accepted', year: 2021 }),
        ],
        lastFullYear: 2024,
        hasLegacyNormalization: () => false,
      })
    ).toBe(false)

    expect(
      hasRecentAcceptedNormalizations({
        normalizationItems: [normalization({ status: 'accepted', applyYears: [2021, 2023] })],
        lastFullYear: 2024,
        hasLegacyNormalization: () => false,
      })
    ).toBe(true)
  })

  it('checks legacy normalization flags only for the active three-year window', () => {
    const hasLegacyNormalization = vi.fn((year: number) => year === 2023)

    expect(
      hasRecentAcceptedNormalizations({
        normalizationItems: [],
        lastFullYear: 2024,
        hasLegacyNormalization,
      })
    ).toBe(true)
    expect(hasLegacyNormalization).toHaveBeenCalledWith(2024)
    expect(hasLegacyNormalization).toHaveBeenCalledWith(2023)
    expect(hasLegacyNormalization).toHaveBeenCalledTimes(2)

    const noLegacyNormalization = vi.fn(() => false)
    expect(
      hasRecentAcceptedNormalizations({
        normalizationItems: [],
        lastFullYear: 2024,
        hasLegacyNormalization: noLegacyNormalization,
      })
    ).toBe(false)
    expect(noLegacyNormalization).toHaveBeenCalledWith(2024)
    expect(noLegacyNormalization).toHaveBeenCalledWith(2023)
    expect(noLegacyNormalization).toHaveBeenCalledWith(2022)
    expect(noLegacyNormalization).toHaveBeenCalledTimes(3)
  })

  it('detects valuation-affecting field and yearly-financial changes', () => {
    const versionFormData = valuationData() as ValuationRequest

    expect(
      hasValuationFormChangesSinceVersion({
        formData: valuationData(),
        versionFormData,
      })
    ).toBe(false)

    expect(
      hasValuationFormChangesSinceVersion({
        formData: valuationData({ revenue: 1_100_000 }),
        versionFormData,
      })
    ).toBe(true)

    expect(
      hasValuationFormChangesSinceVersion({
        formData: valuationData({
          historical_years_data: [{ year: 2024, revenue: 900_000, ebitda: 105_000 }],
        }),
        versionFormData,
      })
    ).toBe(true)
  })

  it('does not report form changes when no previous version exists', () => {
    expect(
      hasValuationFormChangesSinceVersion({
        formData: valuationData(),
        versionFormData: null,
      })
    ).toBe(false)
  })
})
