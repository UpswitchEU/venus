import { afterEach, describe, expect, it } from 'vitest'
import type { NormalizationItem } from '../../components/calculator/UnifiedNormalizationTypes'
import {
  buildTitanNormalizationRequest,
  computeNormalizedEbitda,
} from '../../store/normalizationStoreModel'
import { useEbitdaNormalizationStore } from '../../store/useEbitdaNormalizationStore'
import { type EbitdaNormalization, NormalizationCategory } from '../../types/ebitdaNormalization'
import { buildValuationRequest } from '../buildValuationRequest'
import { getCurrentFilingYear } from '../fiscalYear'
import {
  findAcceptedAutoNormalizationCapBreaches,
  getNormalizationAmountForBase,
  summarizeAcceptedNormalizationsAcrossYears,
} from '../normalizationMath'
import { buildValuationRequestNormalizations } from '../valuationRequestNormalizations'
import { makeFormData } from './buildValuationRequest.testUtils'

const year = getCurrentFilingYear()

function item(overrides: Partial<NormalizationItem> = {}): NormalizationItem {
  return {
    id: 'reviewed-adjustment',
    ledgerCode: '610',
    ledgerName: 'One-time legal cost',
    category: 'one-time',
    type: 'add',
    value: 10_000,
    adjustment: 10_000,
    reason: 'Documented nonrecurring expense',
    source: 'manual',
    status: 'accepted',
    applyAllYears: false,
    year,
    ...overrides,
  }
}

function legacy(): EbitdaNormalization {
  return {
    session_id: 'audit',
    year,
    reported_ebitda: 100_000,
    adjustments: [{ category: NormalizationCategory.ONE_TIME_EXPENSES, amount: 25_000 }],
    custom_adjustments: [],
    total_adjustments: 25_000,
    normalized_ebitda: 125_000,
    confidence_score: 'medium',
  }
}

afterEach(() => useEbitdaNormalizationStore.setState({ normalizations: {} }))

describe('normalization financial integrity audit', () => {
  it.each([
    'add_percent',
    'subtract_percent',
  ] as const)('%s on observed break-even EBITDA cannot reuse an old adjustment', (type) => {
    const row = item({ type, value: 10, adjustment: 12_500 })
    expect(getNormalizationAmountForBase(row, 0)).toBe(0)
    expect(
      buildTitanNormalizationRequest({ items: [row], reportId: 'audit', reportedEbitda: 0, year })
        .adjustments[0].amount
    ).toBe(0)
    expect(
      buildValuationRequest(
        makeFormData({ ebitda: 0, current_year_data: { year, revenue: 1_000_000, ebitda: 0 } }),
        [row]
      ).current_year_data.ebitda
    ).toBe(0)
  })

  it('an absolute target uses the target even when reported EBITDA is zero', () => {
    const row = item({ type: 'absolute', value: 25_000, adjustment: -75_000 })
    expect(getNormalizationAmountForBase(row, 0)).toBe(25_000)
    expect(
      buildTitanNormalizationRequest({ items: [row], reportId: 'audit', reportedEbitda: 0, year })
        .adjustments[0].amount
    ).toBe(25_000)
  })

  it('the store preview and priced request use the same current percentage baseline', () => {
    const row = item({ type: 'add_percent', value: 10, adjustment: 5_000 })
    const request = buildValuationRequest(
      makeFormData({ current_year_data: { year, revenue: 1_000_000, ebitda: 100_000 } }),
      [row]
    )
    expect(request.current_year_data.ebitda).toBe(110_000)
    expect(computeNormalizedEbitda(100_000, [row])).toBe(request.current_year_data.ebitda)
  })

  it.each([
    'accepted',
    'pending',
  ] as const)('repeated target years count a %s adjustment once', (status) => {
    const row = item({ status, applyYears: [year, year] })
    const summary = summarizeAcceptedNormalizationsAcrossYears({
      items: [row],
      availableYears: [year],
      reportedEbitdaByYear: { [year]: 100_000 },
      fallbackYear: year,
    })
    expect(summary.adjustment).toBe(status === 'accepted' ? 10_000 : 0)
    expect(summary.pendingAdjustment).toBe(status === 'pending' ? 10_000 : 0)
    const request = buildValuationRequest(
      makeFormData({ current_year_data: { year, revenue: 1_000_000, ebitda: 100_000 } }),
      [row]
    )
    expect(request.current_year_data.ebitda).toBe(status === 'accepted' ? 110_000 : 100_000)
    expect(request.normalizations).toHaveLength(1)
  })

  it('repeated available years do not duplicate an all-years adjustment', () => {
    const request = buildValuationRequestNormalizations({
      rawNormalizationItems: [item({ applyAllYears: true })],
      legacyNormalizations: {},
      allDataYears: [year, year],
      yearEbitdaMap: { [year]: 100_000 },
    })
    expect(request[year].totalAdjustment).toBe(10_000)
    expect(request[year].count).toBe(1)
  })

  it('a repeated target year cannot trigger a false automatic-addback cap breach', () => {
    expect(
      findAcceptedAutoNormalizationCapBreaches({
        items: [
          item({ source: 'auto', value: 40_000, adjustment: 40_000, applyYears: [year, year] }),
        ],
        availableYears: [year],
        reportedEbitdaByYear: { [year]: 100_000 },
        fallbackYear: year,
      })
    ).toEqual([])
  })

  it.each([
    'pending',
    'rejected',
  ] as const)('a current %s decision cannot resurrect a legacy accepted addback', (status) => {
    useEbitdaNormalizationStore.setState({ normalizations: { [year]: legacy() } })
    const request = buildValuationRequest(
      makeFormData({ current_year_data: { year, revenue: 1_000_000, ebitda: 100_000 } }),
      [item({ status })]
    )
    expect(request.current_year_data.ebitda).toBe(100_000)
    expect(request.current_year_data.ebitda_normalization_metadata?.total_adjustments).toBe(0)
    expect(request.normalizations).toHaveLength(1)
    expect(request.normalizations?.[0].status).toBe(status === 'pending' ? 'proposed' : 'rejected')
  })

  it('legacy-only sessions retain their accepted adjustment', () => {
    useEbitdaNormalizationStore.setState({ normalizations: { [year]: legacy() } })
    const request = buildValuationRequest(
      makeFormData({ current_year_data: { year, revenue: 1_000_000, ebitda: 100_000 } }),
      []
    )
    expect(request.current_year_data.ebitda).toBe(125_000)
    expect(request.normalizations).toHaveLength(1)
  })
})
