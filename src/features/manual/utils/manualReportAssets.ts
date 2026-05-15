import type { ValuationResponse } from '@/types/valuation'
import { getRenderableReportHtml } from '@/utils/safetyNetReportHtml'
import { mergeSessionDataForReportAssets } from '@/utils/sessionPackageHelpers'

export interface BuildManualReportAssetsParams {
  sessionData: Record<string, unknown>
  request: Record<string, unknown>
  taxLatencyItems: unknown[]
  valuationResult: ValuationResponse
  name?: string
}

export interface ManualReportAssets {
  sessionData: Record<string, unknown>
  valuationResult: ValuationResponse
  htmlReport?: string
  name?: string
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
}: BuildManualReportAssetsParams): ManualReportAssets {
  return {
    sessionData: mergeSessionDataForReportAssets(sessionData, request, taxLatencyItems),
    valuationResult,
    htmlReport: getRenderableReportHtml(valuationResult.html_report),
    ...(name ? { name } : {}),
  }
}
