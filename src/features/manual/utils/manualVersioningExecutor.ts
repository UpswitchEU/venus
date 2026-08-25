import type {
  CreateVersionRequest,
  ValuationVersion,
  VersionChanges,
} from '@/types/ValuationVersion'
import type { ValuationRequest, ValuationResponse } from '@/types/valuation'
import { getRenderableReportHtml } from '@/utils/safetyNetReportHtml'
import {
  type ManualLatestVersion,
  type ManualVersionBaseline,
  planManualCalculationVersioning,
} from './manualVersioningDecision'

export interface ManualVersioningExecutorDeps {
  fetchVersions: (reportId: string) => Promise<void>
  getLatestVersion: (reportId: string) => ManualLatestVersion | null
  createVersion: (request: CreateVersionRequest) => Promise<ValuationVersion>
  updateVersion: (
    reportId: string,
    versionNumber: number,
    updates: { versionLabel?: string }
  ) => Promise<void>
  snapshotNormalizationsToVersion: (reportId: string, versionId: string) => Promise<void>
  logRegeneration: (
    reportId: string,
    versionNumber: number,
    changes: VersionChanges,
    calculationDurationMs?: number,
    userId?: string
  ) => unknown
}

export interface RunManualCalculationVersioningParams {
  reportId: string
  previousVersion: ManualVersionBaseline | null
  request: ValuationRequest
  valuationResult: ValuationResponse
  calculationDurationMs: number
  userId?: string
  initialVersionLabel?: string
  isStillTarget?: () => boolean
  deps: ManualVersioningExecutorDeps
}

export interface ManualCalculationVersioningResult {
  aborted: boolean
  versionCreationFailed: boolean
  fetchError?: unknown
  versionError?: unknown
}

/**
 * Executes the post-calculation versioning workflow for manual valuations.
 * Decision logic stays pure in `planManualCalculationVersioning`; this function
 * owns the async side effects and stale-target checks around them.
 */
export async function runManualCalculationVersioning({
  reportId,
  previousVersion,
  request,
  valuationResult,
  calculationDurationMs,
  userId,
  initialVersionLabel,
  isStillTarget = () => true,
  deps,
}: RunManualCalculationVersioningParams): Promise<ManualCalculationVersioningResult> {
  try {
    await deps.fetchVersions(reportId)
    if (!isStillTarget()) return { aborted: true, versionCreationFailed: false }
  } catch (fetchError) {
    if (!isStillTarget()) return { aborted: true, versionCreationFailed: false }
    return { aborted: false, versionCreationFailed: false, fetchError }
  }

  const latestVersion = deps.getLatestVersion(reportId)
  if (!latestVersion) return { aborted: false, versionCreationFailed: false }

  try {
    const versioningDecision = planManualCalculationVersioning({
      previousVersion,
      latestVersion,
      request,
    })

    if (!isStillTarget()) return { aborted: true, versionCreationFailed: false }

    if (versioningDecision.firstTitanVersionAudit) {
      if (initialVersionLabel) {
        await deps.updateVersion(
          reportId,
          versioningDecision.firstTitanVersionAudit.versionNumber,
          { versionLabel: initialVersionLabel }
        )
      }
      deps.logRegeneration(
        reportId,
        versioningDecision.firstTitanVersionAudit.versionNumber,
        versioningDecision.firstTitanVersionAudit.changes,
        calculationDurationMs,
        userId
      )
    }

    if (versioningDecision.titanRegenerationAudit) {
      deps.logRegeneration(
        reportId,
        versioningDecision.titanRegenerationAudit.versionNumber,
        versioningDecision.titanRegenerationAudit.changes,
        calculationDurationMs,
        userId
      )
    }

    if (versioningDecision.venusVersionCreate) {
      const newVersion = await deps.createVersion({
        reportId,
        formData: request,
        valuationResult,
        htmlReport: getRenderableReportHtml(valuationResult.html_report),
        changesSummary: versioningDecision.venusVersionCreate.changes,
        versionLabel: versioningDecision.venusVersionCreate.versionLabel,
      })
      await deps.snapshotNormalizationsToVersion(reportId, newVersion.id)
      if (!isStillTarget()) return { aborted: true, versionCreationFailed: false }

      deps.logRegeneration(
        reportId,
        newVersion.versionNumber,
        versioningDecision.venusVersionCreate.changes,
        calculationDurationMs,
        userId
      )
    }

    return { aborted: false, versionCreationFailed: false }
  } catch (versionError) {
    if (!isStillTarget()) return { aborted: true, versionCreationFailed: false }
    return { aborted: false, versionCreationFailed: true, versionError }
  }
}
