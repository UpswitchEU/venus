import { describe, expect, it } from 'vitest'
import type { ValuationVersion } from '../../types/ValuationVersion'
import {
  buildHistoryVersions,
  deriveHistoryChanges,
  deriveHistoryVersionType,
  type HistoryTranslator,
} from './HistoryPanelModel'

const translate: HistoryTranslator = (key, values) => {
  if (key === 'versionN') return `Version ${values?.number ?? 1}`
  const translations: Record<string, string> = {
    changed: 'Changed',
    guest: 'Guest',
    user: 'User',
  }
  return translations[key] ?? key
}

function version(overrides: Partial<ValuationVersion>): ValuationVersion {
  return {
    id: overrides.id ?? `version-${overrides.versionNumber ?? 1}`,
    reportId: 'report-1',
    versionNumber: overrides.versionNumber ?? 1,
    versionLabel: overrides.versionLabel ?? `Version ${overrides.versionNumber ?? 1}`,
    createdAt: overrides.createdAt ?? new Date('2026-06-01T12:00:00.000Z'),
    createdBy: overrides.createdBy ?? 'guest',
    formData: {},
    valuationResult: overrides.valuationResult ?? null,
    htmlReport: null,
    changesSummary: overrides.changesSummary ?? { significantChanges: [], totalChanges: 0 },
    isActive: overrides.isActive ?? false,
    isPinned: false,
    ...overrides,
  } as unknown as ValuationVersion
}

describe('HistoryPanelModel', () => {
  it('builds sorted history without mutating the store-provided array', () => {
    const storeVersions = [
      version({ id: 'version-1', versionNumber: 1 }),
      version({ id: 'version-3', versionNumber: 3, isActive: true }),
      version({ id: 'version-2', versionNumber: 2 }),
    ]
    const originalOrder = storeVersions.map((item) => item.id)

    const history = buildHistoryVersions({
      report: null,
      storeVersions,
      translate,
      user: null,
    })

    expect(history.map((item) => item.id)).toEqual(['version-3', 'version-2', 'version-1'])
    expect(storeVersions.map((item) => item.id)).toEqual(originalOrder)
  })

  it('deduplicates stale duplicate version rows before rendering history', () => {
    const history = buildHistoryVersions({
      report: null,
      storeVersions: [
        version({
          id: 'version-2-old',
          versionNumber: 2,
          createdAt: new Date('2026-06-01T12:00:00.000Z'),
        }),
        version({ id: 'version-1', versionNumber: 1 }),
        version({
          id: 'version-2-new',
          versionNumber: 2,
          createdAt: new Date('2026-06-02T12:00:00.000Z'),
        }),
      ],
      translate,
      user: null,
    })

    expect(history.map((item) => item.id)).toEqual(['version-2-new', 'version-1'])
  })

  it('synthesizes a current report version with the full live valuation range', () => {
    const history = buildHistoryVersions({
      now: new Date('2026-06-19T08:30:00.000Z'),
      report: {
        id: 'report-1',
        valuation: 293_000,
        valuationLow: 220_000,
        valuationHigh: 367_000,
        ebitda: 70_000,
        multiple: 4.19,
      },
      storeVersions: [],
      translate,
      user: null,
    })

    expect(history).toEqual([
      expect.objectContaining({
        id: 'current',
        isCurrent: true,
        timestamp: new Date('2026-06-19T08:30:00.000Z'),
        valuation: 293_000,
        valuationLow: 220_000,
        valuationHigh: 367_000,
      }),
    ])
  })

  it('uses the active version number as the single current source of truth', () => {
    const history = buildHistoryVersions({
      activeVersionNumber: 2,
      report: { id: 'report-1', valuation: 300_000 },
      storeVersions: [
        version({
          id: 'version-3',
          isActive: true,
          valuationResult: { valuation_summary: { final_valuation: 390_000 } },
          versionNumber: 3,
        }),
        version({
          id: 'version-2',
          valuationResult: { valuation_summary: { final_valuation: 280_000 } },
          versionNumber: 2,
        }),
      ],
      translate,
      user: null,
    })

    expect(history.find((item) => item.id === 'version-2')?.isCurrent).toBe(true)
    expect(history.find((item) => item.id === 'version-3')?.isCurrent).toBe(false)
  })

  it('falls back to live report metrics only for the current zero-only snapshot', () => {
    const history = buildHistoryVersions({
      activeVersionNumber: 2,
      report: {
        id: 'report-1',
        ebitda: 70_000,
        multiple: 4.19,
        valuation: 293_000,
        valuationHigh: 367_000,
        valuationLow: 220_000,
      },
      storeVersions: [
        version({
          id: 'version-2',
          valuationResult: {
            equity_value_high: 0,
            equity_value_low: 0,
            valuation_summary: { final_valuation: 0 },
          },
          versionNumber: 2,
        }),
        version({
          id: 'version-1',
          valuationResult: {
            equity_value_high: 0,
            equity_value_low: 0,
            valuation_summary: { final_valuation: 0 },
          },
          versionNumber: 1,
        }),
      ],
      translate,
      user: null,
    })

    expect(history.find((item) => item.id === 'version-2')).toEqual(
      expect.objectContaining({
        ebitda: 70_000,
        multiple: 4.19,
        valuation: 293_000,
        valuationHigh: 367_000,
        valuationLow: 220_000,
      })
    )
    expect(history.find((item) => item.id === 'version-1')).toEqual(
      expect.objectContaining({
        ebitda: undefined,
        multiple: undefined,
        valuation: undefined,
        valuationHigh: undefined,
        valuationLow: undefined,
      })
    )
  })

  it('derives version types and caps change summaries deterministically', () => {
    expect(deriveHistoryVersionType(version({ versionLabel: 'Normalisatie review' }))).toBe(
      'normalization'
    )
    expect(
      deriveHistoryVersionType(version({ versionLabel: 'Methodologie multiple update' }))
    ).toBe('methodology')
    expect(deriveHistoryVersionType(version({ versionLabel: 'Financiele data update' }))).toBe(
      'data_update'
    )
    expect(deriveHistoryVersionType(version({ versionNumber: 1, versionLabel: 'Initial' }))).toBe(
      'initial'
    )

    const changes = deriveHistoryChanges(
      version({
        changesSummary: {
          revenue: { from: 100, timestamp: new Date(), to: 200 },
          ebitda: { from: 10, timestamp: new Date(), to: 20 },
          totalAssets: { from: 3, timestamp: new Date(), to: 4 },
          cash: { from: 1, timestamp: new Date(), to: 2 },
          companyName: { from: 'Old', timestamp: new Date(), to: 'New' },
          businessType: { from: 'A', timestamp: new Date(), to: 'B' },
          significantChanges: ['revenue'],
          totalChanges: 6,
        },
      }),
      'Changed'
    )

    expect(changes).toHaveLength(5)
    expect(changes.map((change) => change.field)).toEqual([
      'revenue',
      'ebitda',
      'totalAssets',
      'cash',
      'companyName',
    ])
  })
})
