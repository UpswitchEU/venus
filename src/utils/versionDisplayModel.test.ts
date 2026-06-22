import { describe, expect, it } from 'vitest'
import type { ValuationVersion } from '../types/ValuationVersion'
import { buildVersionDisplayList } from './versionDisplayModel'

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

describe('versionDisplayModel', () => {
  it('deduplicates exact ids before applying version-number precedence', () => {
    const first = version({ id: 'same-id', versionNumber: 1 })
    const duplicateId = version({
      id: 'same-id',
      versionNumber: 2,
      createdAt: new Date('2026-01-03T00:00:00Z'),
    })
    const second = version({ id: 'second-id', versionNumber: 2 })

    expect(
      buildVersionDisplayList([first, duplicateId, second], { deduplicateIds: true }).map(
        (item) => item.id
      )
    ).toEqual(['second-id', 'same-id'])
  })

  it('keeps the newest timestamp per version number and sorts descending by default', () => {
    const oldVersionTwo = version({
      id: 'v2-old',
      versionNumber: 2,
      createdAt: new Date('2026-02-01T00:00:00Z'),
    })
    const newVersionTwo = version({
      id: 'v2-new',
      versionNumber: 2,
      createdAt: '2026-02-02T00:00:00Z' as unknown as Date,
    })
    const versionThree = version({ id: 'v3', versionNumber: 3 })
    const versionOne = version({ id: 'v1', versionNumber: 1 })

    expect(
      buildVersionDisplayList([oldVersionTwo, versionOne, newVersionTwo, versionThree]).map(
        (item) => item.id
      )
    ).toEqual(['v3', 'v2-new', 'v1'])
  })

  it('supports toolbar id tie-breaking when timestamps are equal', () => {
    const a = version({
      id: 'version-a',
      versionNumber: 4,
      createdAt: new Date('2026-04-01T00:00:00Z'),
    })
    const b = version({
      id: 'version-b',
      versionNumber: 4,
      createdAt: new Date('2026-04-01T00:00:00Z'),
    })

    expect(
      buildVersionDisplayList([a, b], { timestampTie: 'lexicographic-id' }).map((item) => item.id)
    ).toEqual(['version-b'])
  })

  it('can preserve store ordering and last-writer tie behavior', () => {
    const first = version({
      id: 'first',
      versionNumber: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })
    const second = version({
      id: 'second',
      versionNumber: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })
    const versionTwo = version({ id: 'v2', versionNumber: 2 })

    expect(
      buildVersionDisplayList([first, second, versionTwo], {
        sort: 'asc',
        timestampTie: 'last',
      }).map((item) => item.id)
    ).toEqual(['second', 'v2'])
  })
})
