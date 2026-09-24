import type { ValuationResponse } from '@/types/valuation'
import { deepEqual } from '@/utils/deepEqual'
import { getRenderableReportHtml } from '@/utils/safetyNetReportHtml'
import {
  mergeSessionDataForReportAssets,
  mergeSessionDataForReportAssetsKeepingNewerInputs,
} from '@/utils/sessionPackageHelpers'

export interface BuildManualReportAssetsParams {
  sessionData: Record<string, unknown>
  request: Record<string, unknown>
  taxLatencyItems: unknown[]
  valuationResult: ValuationResponse
  name?: string
  htmlReport?: string | null
  /**
   * Form fields that changed after `sessionData` was captured (edits made while the
   * calculation ran). They are left out of the save so the newer values survive.
   */
  changedFormKeys?: readonly string[]
}

export interface ManualReportAssets {
  sessionData: Record<string, unknown>
  valuationResult: ValuationResponse
  htmlReport?: string
  name?: string
}

/**
 * Top-level form fields whose value differs between the submit-time snapshot and the
 * current form. Empty when nothing changed while the calculation ran.
 */
export function formKeysChangedSinceSubmit(
  submitted: Record<string, unknown>,
  latest: Record<string, unknown>
): string[] {
  if (submitted === latest) return []
  const keys = new Set([...Object.keys(submitted), ...Object.keys(latest)])
  return [...keys].filter((key) => !deepEqual(submitted[key], latest[key]))
}

/**
 * Builds the durable report-assets payload saved after manual calculations.
 * Keeping this contract shared prevents the restored draft, valuation result,
 * PDF HTML, and tax latency state from drifting between submit/recalc paths.
 */
export function buildManualReportAssets({
  sessionData,
  request,
  taxLatencyItems,
  valuationResult,
  name,
  htmlReport,
  changedFormKeys,
}: BuildManualReportAssetsParams): ManualReportAssets {
  const mergedSessionData =
    changedFormKeys && changedFormKeys.length > 0
      ? mergeSessionDataForReportAssetsKeepingNewerInputs(
          sessionData,
          request,
          taxLatencyItems,
          changedFormKeys
        )
      : mergeSessionDataForReportAssets(sessionData, request, taxLatencyItems)

  return {
    sessionData: mergedSessionData,
    valuationResult,
    htmlReport: getRenderableReportHtml(htmlReport ?? valuationResult.html_report),
    ...(name ? { name } : {}),
  }
}
