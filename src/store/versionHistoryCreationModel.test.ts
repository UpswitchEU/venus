import { describe, expect, it } from 'vitest'
import type { CreateVersionRequest, ValuationVersion } from '../types/ValuationVersion'
import {
  applyCreatedBackendVersion,
  buildLocalFallbackVersionCreation,
  buildVersionCreationKey,
  selectLatestVersion,
} from './versionHistoryCreationModel'

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

function request(overrides: Partial<CreateVersionRequest> = {}): CreateVersionRequest {
  return {
    reportId: 'report-1',
    formData: { company_name: 'Acme BV' } as ValuationVersion['formData'],
    ...overrides,
  }
}

describe('versionHistoryCreationModel', () => {
  it('builds stable pending-creation keys', () => {
    expect(buildVersionCreationKey(request())).toBe('report-1_auto')
    expect(buildVersionCreationKey(request({ versionLabel: 'Base case' }))).toBe(
      'report-1_Base case'
    )
  })

  it('selects the highest version number for duplicate creation fallback', () => {
    expect(
      selectLatestVersion([
        version({ versionNumber: 2, versionLabel: 'Second' }),
        version({ versionNumber: 1, versionLabel: 'First' }),
        version({ versionNumber: 5, versionLabel: 'Fifth' }),
      ])
    ).toMatchObject({ versionNumber: 5, versionLabel: 'Fifth' })
  })

  it('applies backend versions without duplicating existing version numbers', () => {
    const existing = version({ versionNumber: 1, versionLabel: 'Existing' })
    const duplicate = version({ id: 'backend-duplicate', versionNumber: 1 })
    const next = version({ id: 'backend-next', versionNumber: 2 })

    const duplicateResult = applyCreatedBackendVersion({
      reportId: 'report-1',
      state: { activeVersions: {}, versions: { 'report-1': [existing] } },
      version: duplicate,
    })
    expect(duplicateResult.versionExists).toBe(true)
    expect(duplicateResult.nextState.versions['report-1']).toEqual([existing])
    expect(duplicateResult.nextState.activeVersions['report-1']).toBe(1)

    const nextResult = applyCreatedBackendVersion({
      reportId: 'report-1',
      state: duplicateResult.nextState,
      version: next,
    })
    expect(nextResult.versionExists).toBe(false)
    expect(nextResult.nextState.versions['report-1']?.map((v) => v.versionNumber)).toEqual([1, 2])
    expect(nextResult.nextState.activeVersions['report-1']).toBe(2)
  })

  it('builds local fallback versions from deduplicated inactive history', () => {
    const olderDuplicate = version({
      id: 'older-duplicate',
      versionNumber: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })
    const newerDuplicate = version({
      id: 'newer-duplicate',
      versionNumber: 1,
      createdAt: new Date('2026-01-02T00:00:00Z'),
    })

    const result = buildLocalFallbackVersionCreation({
      existingVersions: [olderDuplicate, newerDuplicate],
      request: request({ versionLabel: 'Fallback' }),
    })

    expect(result.nextVersionNumber).toBe(2)
    expect(result.localVersion).toMatchObject({
      reportId: 'report-1',
      versionLabel: 'Fallback',
      versionNumber: 2,
      isActive: true,
    })
    expect(result.versions).toHaveLength(2)
    expect(result.versions[0]).toMatchObject({ id: 'newer-duplicate', isActive: false })
    expect(result.versions[1]).toBe(result.localVersion)
  })
})
