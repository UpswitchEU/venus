import { describe, expect, it } from 'vitest'
import type { ValuationVersion } from '../types/ValuationVersion'
import {
  buildSortedTimelineVersions,
  buildVersionTimelineItemModel,
  buildVersionTimelineListModel,
  positiveFiniteNumber,
} from './VersionTimelineModel'

function version(overrides: Partial<ValuationVersion>): ValuationVersion {
  return {
    id: `version-${overrides.versionNumber ?? 1}`,
    reportId: 'report-1',
    versionNumber: 1,
    versionLabel: `Version ${overrides.versionNumber ?? 1}`,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: null,
    formData: {} as ValuationVersion['formData'],
    valuationResult: null,
    htmlReport: null,
    changesSummary: { totalChanges: 0, significantChanges: [] },
    isActive: false,
    isPinned: false,
    tags: [],
    ...overrides,
  }
}

describe('VersionTimelineModel', () => {
  it('only accepts positive finite numbers for valuation display', () => {
    expect(positiveFiniteNumber(1)).toBe(1)
    expect(positiveFiniteNumber('2.5')).toBe(2.5)
    expect(positiveFiniteNumber(0)).toBeNull()
    expect(positiveFiniteNumber(-1)).toBeNull()
    expect(positiveFiniteNumber('not-a-number')).toBeNull()
  })

  it('deduplicates exact duplicate ids before applying version-number precedence', () => {
    const first = version({ id: 'same-id', versionNumber: 1, versionLabel: 'First' })
    const duplicateId = version({
      id: 'same-id',
      versionNumber: 2,
      versionLabel: 'Duplicate id ignored',
    })
    const second = version({ id: 'second-id', versionNumber: 2, versionLabel: 'Second' })

    expect(buildSortedTimelineVersions([first, duplicateId, second])).toEqual([second, first])
  })

  it('keeps the newest timestamp for duplicate version numbers and sorts newest number first', () => {
    const oldVersionTwo = version({
      id: 'v2-old',
      versionNumber: 2,
      versionLabel: 'Old v2',
      createdAt: new Date('2026-02-01T00:00:00Z'),
    })
    const newVersionTwo = version({
      id: 'v2-new',
      versionNumber: 2,
      versionLabel: 'New v2',
      createdAt: '2026-02-02T00:00:00Z' as unknown as Date,
    })
    const versionThree = version({ id: 'v3', versionNumber: 3 })
    const versionOne = version({ id: 'v1', versionNumber: 1 })

    expect(
      buildSortedTimelineVersions([oldVersionTwo, versionOne, newVersionTwo, versionThree])
    ).toEqual([versionThree, newVersionTwo, versionOne])
  })

  it('keeps the first encountered version when duplicate version timestamps tie', () => {
    const first = version({
      id: 'first',
      versionNumber: 4,
      createdAt: new Date('2026-04-01T00:00:00Z'),
    })
    const second = version({
      id: 'second',
      versionNumber: 4,
      createdAt: new Date('2026-04-01T00:00:00Z'),
    })

    expect(buildSortedTimelineVersions([first, second])).toEqual([first])
  })

  it('builds pagination state from unique timeline versions', () => {
    const versions = Array.from({ length: 12 }, (_, index) =>
      version({ id: `v${index + 1}`, versionNumber: index + 1 })
    )

    expect(
      buildVersionTimelineListModel({
        versions,
        displayCount: 10,
        totalVersions: 15,
      })
    ).toMatchObject({
      displayedVersions: versions.slice(2).reverse(),
      hasMoreToShow: true,
      hasMoreToFetch: true,
      totalCount: 15,
    })
  })

  it('suppresses zero-only valuation cards and deltas', () => {
    const current = version({
      versionNumber: 2,
      valuationResult: {
        equity_value_high: 0,
        equity_value_low: 0,
        equity_value_mid: 0,
        recommended_asking_price: 0,
        valuation_summary: { final_valuation: 0 },
      },
    })
    const previous = version({
      versionNumber: 1,
      valuationResult: {
        equity_value_high: 480_000,
        equity_value_low: 320_000,
        equity_value_mid: 400_000,
        recommended_asking_price: 420_000,
        valuation_summary: { final_valuation: 400_000 },
      },
    })

    expect(
      buildVersionTimelineItemModel({ version: current, previousVersion: previous })
    ).toMatchObject({
      currentValuation: null,
      previousValuation: 400_000,
      priceChange: 0,
      priceChangePercent: 0,
      valuationCard: null,
    })
  })

  it('builds valuation card and normalized EBITDA metadata', () => {
    const item = buildVersionTimelineItemModel({
      version: version({
        changeMetadata: { normalized_years: [2024, 2025] },
        changesSummary: { totalChanges: 2, significantChanges: ['revenue'] },
        valuationResult: {
          equity_value_high: 500_000,
          equity_value_low: 300_000,
          equity_value_mid: 400_000,
          recommended_asking_price: 460_000,
          valuation_summary: { final_valuation: 400_000 },
        },
      }),
      previousVersion: version({
        valuationResult: {
          equity_value_mid: 300_000,
          valuation_summary: { final_valuation: 300_000 },
        },
      }),
    })

    expect(item).toMatchObject({
      currentValuation: 400_000,
      previousValuation: 300_000,
      priceChange: 100_000,
      hasChanges: true,
      hasNormalizedEbitda: true,
      normalizedYearsCount: 2,
      valuationCard: {
        equityValueLow: 300_000,
        equityValueMid: 400_000,
        equityValueHigh: 500_000,
        recommendedAskingPrice: 460_000,
        premiumPercent: 15,
      },
    })
    expect(item.priceChangePercent).toBeCloseTo(33.3333, 4)
  })
})
