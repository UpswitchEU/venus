import type { VersionChanges } from '@/types/ValuationVersion'
import type { ValuationRequest } from '@/types/valuation'
import {
  areChangesSignificant,
  detectVersionChanges,
  generateAutoLabel,
} from '@/utils/versionDiffDetection'

export interface ManualVersionBaseline {
  versionNumber: number
  formData: ValuationRequest
}

export interface ManualLatestVersion {
  versionNumber: number
}

export interface ManualVersionAuditEntry {
  versionNumber: number
  changes: VersionChanges
}

export interface ManualVenusVersionCreateDecision {
  nextVersionNumber: number
  versionLabel: string
  changes: VersionChanges
}

export interface ManualCalculationVersioningDecision {
  firstTitanVersionAudit?: ManualVersionAuditEntry
  titanRegenerationAudit?: ManualVersionAuditEntry
  venusVersionCreate?: ManualVenusVersionCreateDecision
}

export interface PlanManualCalculationVersioningParams {
  previousVersion: ManualVersionBaseline | null
  latestVersion: ManualLatestVersion | null
  request: ValuationRequest
}

function emptyChanges(): VersionChanges {
  return { totalChanges: 0, significantChanges: [] }
}

/**
 * Decides how the manual flow should react after Titan recalculates versions.
 *
 * Titan may already create V1 or a new regeneration version. Venus should only
 * create a client-side version when the previous version still remains latest
 * and the form changes are significant.
 */
export function planManualCalculationVersioning({
  previousVersion,
  latestVersion,
  request,
}: PlanManualCalculationVersioningParams): ManualCalculationVersioningDecision {
  if (!latestVersion) return {}

  if (!previousVersion) {
    return {
      firstTitanVersionAudit: {
        versionNumber: latestVersion.versionNumber,
        changes: emptyChanges(),
      },
    }
  }

  const changes = detectVersionChanges(previousVersion.formData, request)

  if (latestVersion.versionNumber > previousVersion.versionNumber) {
    return {
      titanRegenerationAudit: {
        versionNumber: latestVersion.versionNumber,
        changes,
      },
    }
  }

  if (areChangesSignificant(changes)) {
    const nextVersionNumber = latestVersion.versionNumber + 1
    return {
      venusVersionCreate: {
        nextVersionNumber,
        versionLabel: generateAutoLabel(nextVersionNumber, changes),
        changes,
      },
    }
  }

  return {}
}
