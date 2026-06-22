import { describe, expect, it } from 'vitest'
import type { ValuationVersion } from '../types/ValuationVersion'
import type { ValuationRequest, ValuationResponse } from '../types/valuation'
import {
  buildToolbarDisplayVersions,
  buildToolbarSaveStatusModel,
  hasToolbarValuationPrice,
  resolveToolbarActiveVersion,
  resolveToolbarSelectedVersionNumber,
} from './ValuationToolbarModel'

function makeVersion(
  partial: Pick<ValuationVersion, 'id' | 'versionNumber' | 'createdAt'>
): ValuationVersion {
  return {
    id: partial.id,
    reportId: 'report-1',
    versionNumber: partial.versionNumber,
    versionLabel: `Version ${partial.versionNumber}`,
    createdAt: partial.createdAt,
    createdBy: 'user-1',
    formData: {} as ValuationRequest,
    valuationResult: null,
    htmlReport: null,
    changesSummary: { totalChanges: 0, significantChanges: [] },
    isActive: false,
    isPinned: false,
  }
}

describe('ValuationToolbarModel', () => {
  it('deduplicates versions by version number and keeps the freshest candidate', () => {
    const versions = [
      makeVersion({
        id: 'v2-old',
        versionNumber: 2,
        createdAt: new Date('2026-01-01T09:00:00Z'),
      }),
      makeVersion({
        id: 'v1',
        versionNumber: 1,
        createdAt: new Date('2026-01-01T08:00:00Z'),
      }),
      makeVersion({
        id: 'v2-new',
        versionNumber: 2,
        createdAt: new Date('2026-01-01T10:00:00Z'),
      }),
    ]

    expect(buildToolbarDisplayVersions(versions).map((version) => version.id)).toEqual([
      'v2-new',
      'v1',
    ])
  })

  it('resolves active and selected version numbers without mutating the display list', () => {
    const versions = [
      makeVersion({ id: 'v3', versionNumber: 3, createdAt: new Date('2026-01-03T00:00:00Z') }),
      makeVersion({ id: 'v1', versionNumber: 1, createdAt: new Date('2026-01-01T00:00:00Z') }),
    ]

    expect(
      resolveToolbarActiveVersion({ activeVersion: undefined, storeActiveVersionNumber: 3 })
    ).toBe(3)
    expect(
      resolveToolbarSelectedVersionNumber({ activeVersion: undefined, displayVersions: versions })
    ).toBe(1)
    expect(
      resolveToolbarSelectedVersionNumber({ activeVersion: 3, displayVersions: versions })
    ).toBe(3)
  })

  it('builds save-status presentation from stable primitives', () => {
    const nowMs = Date.parse('2026-01-01T12:00:00Z')

    expect(
      buildToolbarSaveStatusModel({
        syncError: new Error('failed'),
        isSaving: false,
        hasUnsavedChanges: false,
        lastSaved: null,
        nowMs,
      })
    ).toMatchObject({
      kind: 'error',
      tooltipKey: 'report.saveStatus.saveFailed',
      canRetry: true,
    })

    expect(
      buildToolbarSaveStatusModel({
        syncError: null,
        isSaving: false,
        hasUnsavedChanges: false,
        lastSaved: new Date('2026-01-01T11:45:00Z'),
        nowMs,
      })
    ).toMatchObject({
      kind: 'savedAged',
      tooltipKey: 'report.saveStatus.savedAgo',
      tooltipValues: { minutes: 15 },
    })

    expect(
      buildToolbarSaveStatusModel({
        syncError: null,
        isSaving: false,
        hasUnsavedChanges: false,
        lastSaved: new Date('2026-01-01T09:00:00Z'),
        nowMs,
      })
    ).toMatchObject({
      kind: 'savedAged',
      tooltipKey: 'report.saveStatus.savedHoursAgo',
      tooltipValues: { hours: 3 },
    })
  })

  it('detects valuation price signals across canonical and nested response shapes', () => {
    expect(hasToolbarValuationPrice(null)).toBe(false)
    expect(hasToolbarValuationPrice({ equity_value_low: 0, equity_value_high: 0 })).toBe(true)
    expect(
      hasToolbarValuationPrice({
        valuation_summary: { recommended_asking_price: 450_000 },
      } as ValuationResponse)
    ).toBe(true)
  })
})
