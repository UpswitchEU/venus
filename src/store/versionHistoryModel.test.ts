import { describe, expect, it, vi } from 'vitest'
import type { ValuationVersion } from '../types/ValuationVersion'
import {
  appendVersionIfMissing,
  compareValuationVersions,
  createLocalVersionSnapshot,
  deduplicateVersionsByNumber,
  detectVersionChanges,
  markVersionsInactive,
  mergeBackendVersionsByNumber,
  partializeVersionHistoryState,
} from './versionHistoryModel'

function version(overrides: Partial<ValuationVersion>): ValuationVersion {
  return {
    id: `version-${overrides.versionNumber ?? 1}`,
    reportId: 'report-1',
    versionNumber: 1,
    versionLabel: 'Version 1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: null,
    formData: {} as ValuationVersion['formData'],
    valuationResult: null,
    htmlReport: null,
    changesSummary: { totalChanges: 0, significantChanges: [] },
    isActive: true,
    isPinned: false,
    ...overrides,
  }
}

describe('versionHistoryModel', () => {
  it('deduplicates versions by number using date-like timestamps', () => {
    const older = version({
      id: 'older',
      versionNumber: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })
    const newer = version({
      id: 'newer',
      versionNumber: 1,
      createdAt: '2026-01-02T00:00:00Z' as unknown as Date,
    })

    expect(deduplicateVersionsByNumber([older, newer])).toEqual([newer])
  })

  it('keeps backend versions authoritative when merging with local cache', () => {
    const local = version({
      id: 'local',
      versionNumber: 1,
      versionLabel: 'Local',
      createdAt: new Date('2026-01-03T00:00:00Z'),
    })
    const backend = version({
      id: 'backend',
      versionNumber: 1,
      versionLabel: 'Backend',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })

    expect(
      mergeBackendVersionsByNumber({
        localVersions: [local],
        backendVersions: [backend],
      })
    ).toEqual([backend])
  })

  it('appends a new version without duplicating existing version numbers', () => {
    const existing = version({ versionNumber: 1 })
    const duplicate = version({ id: 'duplicate', versionNumber: 1 })
    const next = version({ id: 'next', versionNumber: 2 })

    expect(appendVersionIfMissing({ versions: [existing], version: duplicate })).toEqual({
      versionExists: true,
      versions: [existing],
    })
    expect(appendVersionIfMissing({ versions: [existing], version: next })).toEqual({
      versionExists: false,
      versions: [existing, next],
    })
  })

  it('creates local fallback snapshots with safe html and generated labels', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'))

    const snapshot = createLocalVersionSnapshot({
      id: 'fixed-id',
      versionNumber: 3,
      request: {
        reportId: 'report-1',
        formData: { company_name: 'Acme BV' } as ValuationVersion['formData'],
        htmlReport: '<main>Report</main>',
        changesSummary: { totalChanges: 1, significantChanges: ['revenue'] },
      },
    })

    expect(snapshot).toMatchObject({
      id: 'fixed-id',
      versionNumber: 3,
      versionLabel: 'v3 - Adjusted revenue',
      htmlReport: '<main>Report</main>',
      isActive: true,
    })
    expect(snapshot.createdAt).toEqual(new Date('2026-02-01T00:00:00Z'))

    vi.useRealTimers()
  })

  it('marks previous versions inactive', () => {
    expect(markVersionsInactive([version({ versionNumber: 1 })])[0]?.isActive).toBe(false)
  })

  it('detects significant financial changes with stable timestamps', () => {
    const timestamp = new Date('2026-06-20T12:00:00Z')

    const changes = detectVersionChanges(
      {
        company_name: 'Old Co',
        founding_year: 2010,
        current_year_data: { year: 2025, revenue: 2_000_000, ebitda: 500_000 },
      } as unknown as ValuationVersion['formData'],
      {
        company_name: 'New Co',
        founding_year: 2012,
        current_year_data: { year: 2025, revenue: 2_500_000, ebitda: 750_000 },
      } as unknown as ValuationVersion['formData'],
      timestamp
    )

    expect(changes.revenue).toMatchObject({
      from: 2_000_000,
      percentChange: 25,
      timestamp,
      to: 2_500_000,
    })
    expect(changes.ebitda).toMatchObject({
      from: 500_000,
      percentChange: 50,
      timestamp,
      to: 750_000,
    })
    expect(changes.companyName).toMatchObject({ from: 'Old Co', to: 'New Co', timestamp })
    expect(changes.foundingYear).toMatchObject({ from: 2010, to: 2012, timestamp })
    expect(changes.significantChanges).toEqual(['revenue', 'ebitda'])
    expect(changes.totalChanges).toBe(4)
  })

  it('compares versions with valuation delta and financial highlights', () => {
    const comparison = compareValuationVersions(
      version({
        versionNumber: 1,
        formData: {
          current_year_data: { year: 2025, revenue: 2_000_000, ebitda: 500_000 },
        } as unknown as ValuationVersion['formData'],
        valuationResult: {
          valuation_summary: { final_valuation: 4_200_000 },
        } as unknown as ValuationVersion['valuationResult'],
      }),
      version({
        versionNumber: 2,
        formData: {
          current_year_data: { year: 2025, revenue: 2_500_000, ebitda: 750_000 },
        } as unknown as ValuationVersion['formData'],
        valuationResult: {
          valuation_summary: { final_valuation: 6_200_000 },
        } as unknown as ValuationVersion['valuationResult'],
      })
    )

    expect(comparison.valuationDelta).toMatchObject({
      absoluteChange: 2_000_000,
      direction: 'increase',
    })
    expect(comparison.highlights).toEqual([
      {
        field: 'revenue',
        impact: '+25.0%',
        label: 'Revenue',
        newValue: 2_500_000,
        oldValue: 2_000_000,
      },
      {
        field: 'ebitda',
        impact: '+50.0%',
        label: 'EBITDA',
        newValue: 750_000,
        oldValue: 500_000,
      },
    ])
  })

  it('compares versions using an accessible positive range midpoint when final valuation is zero', () => {
    const comparison = compareValuationVersions(
      version({
        versionNumber: 1,
        valuationResult: {
          equity_value_high: 18_400_000,
          equity_value_low: 12_800_000,
          equity_value_mid: 0,
          recommended_asking_price: 0,
          valuation_summary: { final_valuation: 0 },
        } as unknown as ValuationVersion['valuationResult'],
      }),
      version({
        versionNumber: 2,
        valuationResult: {
          valuation_summary: { final_valuation: 20_000_000 },
        } as unknown as ValuationVersion['valuationResult'],
      })
    )

    expect(comparison.valuationDelta).toMatchObject({
      absoluteChange: 4_400_000,
      direction: 'increase',
    })
  })

  it('persists only lightweight version metadata', () => {
    const fullVersion = version({
      htmlReport: '<main>Large report</main>',
      formData: {
        country_code: 'BE',
        company_name: 'Acme BV',
        current_year_data: { year: '2025', revenue: 1_000_000, ebitda: 200_000 },
      } as unknown as ValuationVersion['formData'],
      normalization_data: {
        '2025': {
          reported_ebitda: 200_000,
          normalized_ebitda: 220_000,
          total_adjustments: 20_000,
          adjustments: [],
          confidence_score: 'high',
        },
      },
    })

    expect(
      partializeVersionHistoryState({
        versions: { 'report-1': [fullVersion] },
        activeVersions: { 'report-1': 1 },
      })
    ).toMatchObject({
      activeVersions: { 'report-1': 1 },
      versions: {
        'report-1': [
          {
            htmlReport: null,
            normalization_data: undefined,
            _hasHtmlReport: true,
            formData: {
              country_code: 'BE',
              company_name: 'Acme BV',
              current_year_data: { year: 2025, revenue: 1_000_000, ebitda: 200_000 },
            },
          },
        ],
      },
    })
  })
})
