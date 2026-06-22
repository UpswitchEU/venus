import type { ValuationVersion } from '../types/ValuationVersion'
import { dateLikeToUnixMs } from '../utils/date-like'
import {
  getEquityValueHigh,
  getEquityValueLow,
  getEquityValueMid,
  getRecommendedAskingPrice,
} from '../utils/valuationResultAccess'
import { buildVersionDisplayList } from '../utils/versionDisplayModel'

export type ToolbarSaveStatusKind = 'error' | 'saving' | 'dirty' | 'saved' | 'savedAged' | null

export interface ToolbarSaveStatusModel {
  kind: ToolbarSaveStatusKind
  tooltipKey: string | null
  tooltipValues?: { minutes?: number; hours?: number }
  canRetry: boolean
}

export function buildToolbarDisplayVersions(
  versions: readonly ValuationVersion[]
): ValuationVersion[] {
  return buildVersionDisplayList(versions, { sort: 'desc', timestampTie: 'lexicographic-id' })
}

export function resolveToolbarActiveVersion({
  activeVersion,
  storeActiveVersionNumber,
}: {
  activeVersion?: number
  storeActiveVersionNumber?: number | null
}): number | undefined {
  return activeVersion ?? storeActiveVersionNumber ?? undefined
}

export function resolveToolbarSelectedVersionNumber({
  activeVersion,
  displayVersions,
}: {
  activeVersion?: number
  displayVersions: readonly ValuationVersion[]
}): number | undefined {
  return activeVersion ?? displayVersions[displayVersions.length - 1]?.versionNumber
}

export function buildToolbarSaveStatusModel({
  syncError,
  isSaving,
  hasUnsavedChanges,
  lastSaved,
  nowMs = Date.now(),
}: {
  syncError: unknown
  isSaving: boolean
  hasUnsavedChanges: boolean
  lastSaved: unknown
  nowMs?: number
}): ToolbarSaveStatusModel {
  if (syncError) {
    return { kind: 'error', tooltipKey: 'report.saveStatus.saveFailed', canRetry: true }
  }
  if (isSaving) {
    return { kind: 'saving', tooltipKey: 'report.saveStatus.saving', canRetry: false }
  }
  if (hasUnsavedChanges) {
    return { kind: 'dirty', tooltipKey: 'report.saveStatus.savingSoon', canRetry: false }
  }
  if (!lastSaved) {
    return { kind: null, tooltipKey: null, canRetry: false }
  }

  const savedMs = dateLikeToUnixMs(lastSaved)
  const minutesAgo = savedMs === null ? 0 : Math.floor((nowMs - savedMs) / 1000 / 60)
  if (minutesAgo < 1) {
    return { kind: 'saved', tooltipKey: 'report.saveStatus.saved', canRetry: false }
  }
  if (minutesAgo < 60) {
    return {
      kind: 'savedAged',
      tooltipKey: 'report.saveStatus.savedAgo',
      tooltipValues: { minutes: minutesAgo },
      canRetry: false,
    }
  }
  return {
    kind: 'savedAged',
    tooltipKey: 'report.saveStatus.savedHoursAgo',
    tooltipValues: { hours: Math.floor(minutesAgo / 60) },
    canRetry: false,
  }
}

export function hasToolbarValuationPrice(valuationResult: unknown): boolean {
  return (
    getEquityValueMid(valuationResult) !== null ||
    getRecommendedAskingPrice(valuationResult) !== null ||
    getEquityValueLow(valuationResult) !== null ||
    getEquityValueHigh(valuationResult) !== null
  )
}
