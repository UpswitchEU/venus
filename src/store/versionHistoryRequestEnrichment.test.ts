import { beforeEach, describe, expect, it } from 'vitest'
import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationTypes'
import { buildManualNormalizationsFromVersionSnapshot } from '../features/manual/utils/manualVersionNormalizationRestore'
import type { CreateVersionRequest } from '../types/ValuationVersion'
import { buildValuationRequestNormalizations } from '../utils/valuationRequestNormalizations'
import { useNormalizationStore } from './useNormalizationStore'
import { useTaxLatencyStore } from './useTaxLatencyStore'
import { enrichCreateVersionRequestFromStores } from './versionHistoryRequestEnrichment'

const item = (patch: Partial<NormalizationItem> = {}): NormalizationItem => ({
  id: 'legal-cost',
  ledgerCode: '610',
  ledgerName: 'Legal fees',
  category: 'one-time',
  type: 'add',
  value: 0.1,
  adjustment: 0.1,
  source: 'manual',
  status: 'accepted',
  applyAllYears: false,
  year: 2025,
  ...patch,
})
const request = (current: Record<string, unknown> = {}): CreateVersionRequest => ({
  reportId: 'normalization-audit',
  formData: {
    filing_year_confirmed: true,
    current_year_data: { year: 2025, revenue: 100, ebitda: 1, ...current },
    historical_years_data: [{ year: 2024, revenue: 80, ebitda: -1 }],
  } as CreateVersionRequest['formData'],
})

beforeEach(() => {
  useNormalizationStore.setState({ items: [] })
  useTaxLatencyStore.setState({ items: [] })
})

describe('saved normalization financial bridge', () => {
  it('counts each adjustment once per fiscal year and preserves decimal cancellation', () => {
    useNormalizationStore.setState({
      items: [
        item({ applyYears: [2025, 2025] }),
        item({ id: 'other', value: 0.2, adjustment: 0.2 }),
      ],
    })
    const result = enrichCreateVersionRequestFromStores(request({ ebitda: -0.3 }))
    expect(result.normalization_data?.['2025']).toMatchObject({
      reported_ebitda: '-0.3',
      total_adjustments: '0.3',
      normalized_ebitda: '0',
    })
    expect(result.normalization_data?.['2025'].adjustments).toHaveLength(2)
  })

  it('uses the explicit reported baseline without applying the accepted bridge twice', () => {
    useNormalizationStore.setState({ items: [item({ adjustment: 20, value: 20 })] })
    expect(
      enrichCreateVersionRequestFromStores(
        request({
          ebitda: 120,
          reported_ebitda: 100,
          normalized_ebitda: 120,
          ebitda_normalized: true,
        })
      ).normalization_data?.['2025']
    ).toMatchObject({ reported_ebitda: '100', normalized_ebitda: '120' })
  })

  it.each([undefined, null, ''])('retains the ledger with an unknown baseline of %s', (ebitda) => {
    useNormalizationStore.setState({ items: [item()] })
    const saved = enrichCreateVersionRequestFromStores(request({ ebitda })).normalization_data?.[
      '2025'
    ]
    expect(saved).toMatchObject({ reported_ebitda: null, normalized_ebitda: null })
    expect(saved?.adjustments).toHaveLength(1)
    expect(saved?.adjustments[0]).toMatchObject({ frontend_id: 'legal-cost', amount: '0.1' })
  })

  it.each([
    true,
    '1,000',
    'NaN',
    Number.NaN,
  ])('rejects an invalid baseline of %s without silently dropping the ledger', (ebitda) => {
    useNormalizationStore.setState({ items: [item()] })
    expect(() => enrichCreateVersionRequestFromStores(request({ ebitda }))).toThrow(
      /explicit finite decimal/
    )
  })

  it('retains observed zero without publishing a percentage of zero', () => {
    useNormalizationStore.setState({ items: [item()] })
    const saved = enrichCreateVersionRequestFromStores(request({ ebitda: 0 })).normalization_data?.[
      '2025'
    ]
    expect(saved).toMatchObject({ reported_ebitda: '0', normalized_ebitda: '0.1' })
    expect(saved?.adjustment_percentage).toBeUndefined()
  })

  it('restores multi-year review, owner-compensation evidence and annual amounts', () => {
    const rows = [
      item({
        id: 'owner-pay',
        category: 'salary',
        type: 'add',
        value: 10,
        adjustment: 10,
        applyYears: [2024, 2025, 2025],
        source: 'exact',
        sourceRef: 'ledger:620',
        reviewedAt: '2026-01-01T00:00:00Z',
        ruleVersion: 'review.v1',
        ownerRole: 'working',
        actualOwnerCompensation: 110,
        replacementOwnerCompensation: 100,
      }),
      item({ id: 'percentage', type: 'add_percent', value: 10, applyYears: [2024, 2025] }),
    ]
    useNormalizationStore.setState({ items: rows })
    const saved = enrichCreateVersionRequestFromStores(request()).normalization_data
    const restored = buildManualNormalizationsFromVersionSnapshot(JSON.parse(JSON.stringify(saved)))
    expect(restored).toHaveLength(2)
    expect(restored[0]).toMatchObject({
      id: 'owner-pay',
      applyYears: [2024, 2025],
      type: 'add',
      value: 10,
      source: 'exact',
      sourceRef: 'ledger:620',
      reviewedAt: rows[0].reviewedAt,
      ownerRole: 'working',
      actualOwnerCompensation: 110,
      replacementOwnerCompensation: 100,
      ruleVersion: 'review.v1',
    })
    const recalculate = (items: NormalizationItem[]) =>
      buildValuationRequestNormalizations({
        rawNormalizationItems: items,
        legacyNormalizations: {},
        allDataYears: [2024, 2025],
        yearEbitdaMap: { 2024: -1, 2025: 1 },
      })
    expect(recalculate(restored)).toEqual(recalculate(rows))
    expect(recalculate(restored)[2025].items[0]).toMatchObject({
      amount: 10,
      actual_owner_compensation: 110,
      replacement_owner_compensation: 100,
    })
    expect(recalculate(restored)[2024].totalAdjustment).toBe(9.9)
    expect(recalculate(restored)[2025].totalAdjustment).toBe(10.1)
  })

  it('leaves a supplied immutable normalization snapshot unchanged', () => {
    const snapshot = {
      '2025': {
        reported_ebitda: 0,
        normalized_ebitda: 0,
        total_adjustments: 0,
        adjustments: [],
        confidence_score: 'medium',
      },
    }
    useNormalizationStore.setState({ items: [item({ adjustment: 999 })] })
    expect(
      enrichCreateVersionRequestFromStores({ ...request(), normalization_data: snapshot })
        .normalization_data
    ).toBe(snapshot)
  })
})
