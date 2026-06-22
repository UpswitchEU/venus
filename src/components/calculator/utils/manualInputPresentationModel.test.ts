import { describe, expect, it } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import type { NormalizationItem } from '../UnifiedNormalizationModal'
import {
  buildManualInputPresentationModel,
  getManualInputHistoricalCardRows,
  resolveManualInputSelectedBusinessCategory,
  sortManualInputYearlyFinancials,
} from './manualInputPresentationModel'

function makeFormData(overrides: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  return {
    companyName: 'Acme BV',
    businessType: '',
    country: 'BE',
    industry: '',
    ownerManagers: 1,
    yearFounded: '',
    businessStructure: '',
    fteEmployees: undefined,
    yearlyFinancials: [
      { year: '2025', revenue: 1_000_000, ebitda: 120_000 },
      { year: '2024', revenue: 900_000, ebitda: 100_000 },
    ],
    ...overrides,
  } as ManualValuationFormData
}

function normalization(overrides: Partial<NormalizationItem>): NormalizationItem {
  return {
    id: 'norm-1',
    ledgerCode: '620000',
    ledgerName: 'Management fee',
    category: 'salary',
    type: 'add',
    value: 0,
    adjustment: 0,
    source: 'manual',
    status: 'accepted',
    applyAllYears: false,
    year: 2025,
    ...overrides,
  }
}

describe('manual input presentation model', () => {
  it('sorts financial rows and hides forecast rows from historical cards for DCF', () => {
    const rows: YearlyFinancials[] = [
      { year: '2023', revenue: 700, ebitda: 70 },
      { year: '2026', revenue: 1_200, ebitda: 120, isForecast: true },
      { year: '2025', revenue: 1_000, ebitda: 100 },
    ]

    const sorted = sortManualInputYearlyFinancials(rows)

    expect(sorted.map((row) => row.year)).toEqual(['2026', '2025', '2023'])
    expect(
      getManualInputHistoricalCardRows({
        hasDcfSelected: true,
        sortedYearlyFinancials: sorted,
      }).map((row) => row.year)
    ).toEqual(['2025', '2023'])
    expect(
      getManualInputHistoricalCardRows({
        hasDcfSelected: false,
        sortedYearlyFinancials: sorted,
      }).map((row) => row.year)
    ).toEqual(['2026', '2025', '2023'])
  })

  it('builds the manual workflow model with picker precedence, SaaS signals, and DCF steps', () => {
    const formData = makeFormData({
      businessType: 'store-fallback',
      yearlyFinancials: [
        { year: '2026', revenue: 1_100_000, ebitda: 130_000, isForecast: true },
        { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
      ],
    })
    const sortedYearlyFinancials = sortManualInputYearlyFinancials(formData.yearlyFinancials)
    const selectedBusinessType = {
      id: 'picker-primary',
      category: 'saas_software',
    }
    const selectedBusinessCategoryForMethodInputs =
      resolveManualInputSelectedBusinessCategory(selectedBusinessType)

    const model = buildManualInputPresentationModel({
      canSave: true,
      effectiveMethod: 'dcf',
      effectiveMethods: ['dcf', 'adjusted_nav'],
      formData,
      hasDcfForecastWorkspace: true,
      hasDcfSelected: true,
      latestCompleteYearlyFinancial: { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
      normalizationItems: [
        normalization({ id: 'accepted', adjustment: 25_000 }),
        normalization({ id: 'pending', adjustment: 50_000, status: 'pending' }),
      ],
      selectedBusinessCategoryForMethodInputs,
      selectedBusinessType,
      selectedCompanyPresent: true,
      sortedYearlyFinancials,
      storeBusinessModel: 'b2b_saas',
      storeBusinessTypeId: 'store-fallback',
    })

    expect(model.acceptedNormCount).toBe(1)
    expect(model.historicalCardRows.map((row) => row.year)).toEqual(['2025'])
    expect(model.normalizedData.averageNormalizedEbitda).toBe(125_000)
    expect(model.resolvedBusinessTypeIdForBonusSections).toBe('picker-primary')
    expect(model.saasSignalsForBonusSections.businessModel).toBe('b2b_saas')
    expect(model.adaptiveHeaderSteps).toEqual({
      dcfGlobal: 4,
      nav: 8,
      saas: 9,
    })
    expect(model.balanceSheetCarveOutStep).toBe(7)
    expect(model.synthesisStep).toBe(10)
    expect(model.synthesisMethodsForPanel).toEqual(['dcf', 'adjusted_nav'])
    expect(model.readiness.canSubmit).toBe(true)
  })

  it('falls back to persisted business context and store business type when no picker is selected', () => {
    const formData = makeFormData({
      companyName: '',
      businessType: '',
      yearlyFinancials: [{ year: '2025', revenue: 1_000_000, ebitda: 0 }],
    })
    const model = buildManualInputPresentationModel({
      canSave: true,
      effectiveMethod: 'arr_multiple',
      effectiveMethods: ['arr_multiple'],
      formData,
      hasDcfForecastWorkspace: false,
      hasDcfSelected: false,
      latestCompleteYearlyFinancial: { year: '2025', revenue: 1_000_000, ebitda: 0 },
      normalizationItems: [],
      selectedBusinessCategoryForMethodInputs: null,
      selectedBusinessType: null,
      selectedCompanyPresent: false,
      sortedYearlyFinancials: sortManualInputYearlyFinancials(formData.yearlyFinancials),
      storeBusinessContext: { business_category: 'Vertical SaaS', sector_tag: 'b2b-saas' },
      storeBusinessTypeId: 'saas',
    })

    expect(model.resolvedBusinessTypeIdForBonusSections).toBe('saas')
    expect(model.saasSignalsForBonusSections.businessContextCategory).toBe('Vertical SaaS')
    expect(model.saasSignalsForBonusSections.sectorTag).toBe('b2b-saas')
    expect(model.adaptiveHeaderSteps).toEqual({ saas: 5 })
    expect(model.readiness.hasBusinessType).toBe(true)
    expect(model.readiness.hasEbitdaValue).toBe(true)
    expect(model.readiness.canSubmit).toBe(false)
  })
})
