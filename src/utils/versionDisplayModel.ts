import type { ValuationVersion } from '../types/ValuationVersion'
import { dateLikeToUnixMs } from './date-like'

type VersionDisplaySort = 'asc' | 'desc'
type VersionTimestampTiePolicy = 'first' | 'last' | 'lexicographic-id'

interface BuildVersionDisplayListOptions {
  deduplicateIds?: boolean
  sort?: VersionDisplaySort
  timestampTie?: VersionTimestampTiePolicy
}

function versionCreatedAtMs(version: ValuationVersion): number {
  return dateLikeToUnixMs(version.createdAt) ?? Number.NEGATIVE_INFINITY
}

function deduplicateVersionsById(versions: readonly ValuationVersion[]): ValuationVersion[] {
  const idMap = new Map<string, ValuationVersion>()
  for (const version of versions) {
    if (!idMap.has(version.id)) {
      idMap.set(version.id, version)
    }
  }
  return Array.from(idMap.values())
}

function shouldPreferVersionCandidate({
  candidate,
  existing,
  timestampTie,
}: {
  candidate: ValuationVersion
  existing: ValuationVersion
  timestampTie: VersionTimestampTiePolicy
}): boolean {
  const candidateMs = versionCreatedAtMs(candidate)
  const existingMs = versionCreatedAtMs(existing)
  if (candidateMs !== existingMs) return candidateMs > existingMs
  if (timestampTie === 'last') return true
  if (timestampTie === 'lexicographic-id') return candidate.id > existing.id
  return false
}

export function buildVersionDisplayList(
  versions: readonly ValuationVersion[],
  {
    deduplicateIds = false,
    sort = 'desc',
    timestampTie = 'first',
  }: BuildVersionDisplayListOptions = {}
): ValuationVersion[] {
  const candidates = deduplicateIds ? deduplicateVersionsById(versions) : versions
  const versionMap = new Map<number, ValuationVersion>()

  for (const version of candidates) {
    const existing = versionMap.get(version.versionNumber)
    if (
      !existing ||
      shouldPreferVersionCandidate({
        candidate: version,
        existing,
        timestampTie,
      })
    ) {
      versionMap.set(version.versionNumber, version)
    }
  }

  const direction = sort === 'asc' ? 1 : -1
  return Array.from(versionMap.values()).sort(
    (a, b) => direction * (a.versionNumber - b.versionNumber)
  )
}
