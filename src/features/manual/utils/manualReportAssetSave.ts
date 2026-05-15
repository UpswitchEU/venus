import type { ValuationResponse } from '@/types/valuation'
import { buildManualReportAssets } from './manualReportAssets'

export interface SaveManualCalculationReportAssetsDeps {
  saveReportAssets: (
    reportId: string,
    assets: ReturnType<typeof buildManualReportAssets>
  ) => Promise<void>
  markSaved: (dirtyVersion: number) => void
}

export interface SaveManualCalculationReportAssetsParams {
  reportId?: string | null
  sessionData: Record<string, unknown>
  request: Record<string, unknown>
  taxLatencyItems: unknown[]
  valuationResult: ValuationResponse
  name?: string
  dirtyVersion: number
  isStillTarget: () => boolean
  deps: SaveManualCalculationReportAssetsDeps
}

export interface SaveManualCalculationReportAssetsResult {
  aborted: boolean
  durableSaveSucceeded: boolean
  saveError?: unknown
}

/**
 * Persists the authoritative report package after a successful manual
 * calculation. Versioning is allowed to continue only after this succeeds.
 */
export async function saveManualCalculationReportAssets({
  reportId,
  sessionData,
  request,
  taxLatencyItems,
  valuationResult,
  name,
  dirtyVersion,
  isStillTarget,
  deps,
}: SaveManualCalculationReportAssetsParams): Promise<SaveManualCalculationReportAssetsResult> {
  if (!reportId) {
    return { aborted: false, durableSaveSucceeded: true }
  }

  try {
    await deps.saveReportAssets(
      reportId,
      buildManualReportAssets({
        sessionData,
        request,
        taxLatencyItems,
        valuationResult,
        name,
      })
    )
    if (!isStillTarget()) return { aborted: true, durableSaveSucceeded: false }

    deps.markSaved(dirtyVersion)
    return { aborted: false, durableSaveSucceeded: true }
  } catch (saveError) {
    if (!isStillTarget()) return { aborted: true, durableSaveSucceeded: false }
    return { aborted: false, durableSaveSucceeded: false, saveError }
  }
}
