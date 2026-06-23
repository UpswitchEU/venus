import type { CreateVersionRequest, ValuationVersion } from '../types/ValuationVersion'
import {
  appendVersionIfMissing,
  createLocalVersionSnapshot,
  deduplicateVersionsByNumber,
  markVersionsInactive,
} from './versionHistoryModel'

export interface VersionHistoryCreationStateSlice {
  activeVersions: Record<string, number>
  versions: Record<string, ValuationVersion[]>
}

export function buildVersionCreationKey(
  request: Pick<CreateVersionRequest, 'reportId' | 'versionLabel'>
): string {
  return `${request.reportId}_${request.versionLabel || 'auto'}`
}

export function selectLatestVersion(
  versions: readonly ValuationVersion[]
): ValuationVersion | null {
  if (versions.length === 0) return null

  return versions.reduce((latest, current) =>
    current.versionNumber > latest.versionNumber ? current : latest
  )
}

export function applyCreatedBackendVersion({
  reportId,
  state,
  version,
}: {
  reportId: string
  state: VersionHistoryCreationStateSlice
  version: ValuationVersion
}): { nextState: VersionHistoryCreationStateSlice; versionExists: boolean } {
  const reportVersions = state.versions[reportId] || []
  const { versionExists, versions: updatedVersions } = appendVersionIfMissing({
    versions: reportVersions,
    version,
  })

  return {
    nextState: {
      versions: {
        ...state.versions,
        [reportId]: updatedVersions,
      },
      activeVersions: {
        ...state.activeVersions,
        [reportId]: version.versionNumber,
      },
    },
    versionExists,
  }
}

export function buildLocalFallbackVersionCreation({
  existingVersions,
  request,
}: {
  existingVersions: readonly ValuationVersion[]
  request: CreateVersionRequest
}): {
  localVersion: ValuationVersion
  nextVersionNumber: number
  versions: ValuationVersion[]
} {
  const reportVersions = deduplicateVersionsByNumber(existingVersions)
  const nextVersionNumber = Math.max(0, ...reportVersions.map((v) => v.versionNumber)) + 1
  const localVersion = createLocalVersionSnapshot({
    request,
    versionNumber: nextVersionNumber,
  })

  return {
    localVersion,
    nextVersionNumber,
    versions: [...markVersionsInactive(reportVersions), localVersion],
  }
}
