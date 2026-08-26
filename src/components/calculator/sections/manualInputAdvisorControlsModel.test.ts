import { describe, expect, it } from 'vitest'
import type { ManualValuationFormData } from '../../../types/valuation'
import type { ManualInputNormalizedData } from '../utils/manualInputNormalizedData'
import {
  buildManualInputAdvisorControlsModel,
  deriveAdvisorWeightingYears,
  resolveAdvisorControlsPreviewEbitda,
  resolveAdvisorSectorAverageMultiple,
} from './manualInputAdvisorControlsModel'

const emptyNormalizedData: ManualInputNormalizedData = {
  averageNormalizedEbitda: 0,
  totalYearsWithData: 0,
  yearlyAdjustments: {},
} as ManualInputNormalizedData

function makeFormData(overrides: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  return {
    companyName: 'Acme BV',
    businessType: 'software',
    country: 'BE',
    industry: 'technology',
    ownerManagers: 1,
    yearlyFinancials: [],
    ...overrides,
  } as ManualValuationFormData
}

describe('manual input advisor controls model', () => {
  it('derives sorted weighting years from current and historical rows while excluding forecasts', () => {
    const years = deriveAdvisorWeightingYears({
      formData: makeFormData({
        current_year_data: { year: 2025, revenue: '€1.000.000', ebitda: 100_000 },
        historical_years_data: [
          { year: 2024, revenue: 900_000, ebitda: 90_000 },
          { year: 2023, revenue: '750.000', ebitda: 75_000 },
          { year: 2026, revenue: 1_200_000, ebitda: 120_000, isForecast: true },
          { year: 2022, revenue: 0, ebitda: 20_000 },
        ],
      }),
      historicalCardRows: [{ year: 2025, revenue: 1_000_000 }],
    })

    expect(years).toEqual([2023, 2024, 2025])
  })

  it('uses the live financial cards as canonical and applies the same DCF admission rules', () => {
    const years = deriveAdvisorWeightingYears({
      formData: makeFormData({
        // Deliberately stale request-shaped fields: editing happens in yearlyFinancials.
        current_year_data: { year: 2025, revenue: 0, ebitda: 0 },
        historical_years_data: [{ year: 2024, revenue: 0, ebitda: 0 }],
        yearlyFinancials: [
          { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
          { year: '2024', revenue: 900_000, ebitda: 100_000 },
          { year: '2023', revenue: 0, ebitda: 0 },
          { year: '2022', revenue: 800_000, ebitda: undefined as never },
          { year: '2026', revenue: 1_100_000, ebitda: 110_000, isForecast: true },
        ],
      }),
      historicalCardRows: [],
    })

    expect(years).toEqual([2024, 2025])
  })

  it('uses historical card rows as the current year source when current_year_data is missing', () => {
    expect(
      deriveAdvisorWeightingYears({
        formData: makeFormData(),
        historicalCardRows: [{ year: '2024', revenue: '850,000', ebitda: 85_000 }],
      })
    ).toEqual([2024])
  })

  it('resolves the sector average multiple by precedence and tolerant numeric parsing', () => {
    expect(
      resolveAdvisorSectorAverageMultiple({
        benchmark_multiple: '0',
        ev_ebitda_median: '5,5x',
        ev_ebitda_multiple: { median: 6.25, p50: 6.5 },
      })
    ).toBe(5.5)

    expect(
      resolveAdvisorSectorAverageMultiple({
        ev_ebitda_multiple: { median: '', p50: '6.25' },
      })
    ).toBe(6.25)
  })

  it('prefers normalized EBITDA and falls back to persisted EBITDA strings', () => {
    expect(
      resolveAdvisorControlsPreviewEbitda({
        formData: makeFormData({
          current_year_data: { year: 2025, revenue: 1_000_000, ebitda: 100_000 },
          ebitda: 50_000,
        }),
        normalizedData: {
          ...emptyNormalizedData,
          averageNormalizedEbitda: 125_000,
          totalYearsWithData: 3,
        },
      })
    ).toBe(125_000)

    expect(
      resolveAdvisorControlsPreviewEbitda({
        formData: makeFormData({
          current_year_data: { year: 2025, revenue: 1_000_000, ebitda: '95.000' },
        }),
        normalizedData: emptyNormalizedData,
      })
    ).toBe(95_000)
  })

  it('builds the complete advisor-control model used by the method section', () => {
    const model = buildManualInputAdvisorControlsModel({
      formData: makeFormData({
        business_context: { ev_ebitda_multiple: { median: '6,0' } },
        current_year_data: { year: 2025, revenue: 1_000_000, ebitda: 100_000 },
      }),
      historicalCardRows: [{ year: 2025, revenue: 1_000_000, ebitda: 100_000 }],
      normalizedData: emptyNormalizedData,
    })

    expect(model).toEqual({
      advisorControlsPreviewEbitda: 100_000,
      advisorWeightingYears: [2025],
      sectorAverageMultiple: 6,
    })
  })
})
