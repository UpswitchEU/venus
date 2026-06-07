import type { ValuationResponse } from '@/types/valuation'
import { getRenderableReportHtml } from '@/utils/safetyNetReportHtml'
import { mergeSessionDataForReportAssets } from '@/utils/sessionPackageHelpers'
import type { DiscussionPhaseMetadata } from './discussionPhaseMetadata'

export interface BuildManualReportAssetsParams {
  sessionData: Record<string, unknown>
  request: Record<string, unknown>
  taxLatencyItems: unknown[]
  valuationResult: ValuationResponse
  name?: string
  discussionPhase?: DiscussionPhaseMetadata
  htmlReport?: string | null
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
  discussionPhase,
  htmlReport,
}: BuildManualReportAssetsParams): ManualReportAssets {
  const mergedSessionData = mergeSessionDataForReportAssets(sessionData, request, taxLatencyItems)
  const sessionDataWithDiscussion = discussionPhase
    ? mergeDiscussionPhaseIntoMetadata(mergedSessionData, discussionPhase)
    : mergedSessionData
  const valuationResultWithDiscussion = discussionPhase
    ? mergeDiscussionPhaseIntoMetadata(valuationResult, discussionPhase)
    : valuationResult

  return {
    sessionData: sessionDataWithDiscussion,
    valuationResult: valuationResultWithDiscussion,
    htmlReport: getRenderableReportHtml(htmlReport ?? valuationResult.html_report),
    ...(name ? { name } : {}),
  }
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

function mergeDiscussionPhaseIntoMetadata<T extends object>(
  value: T,
  discussionPhase: DiscussionPhaseMetadata
): T & { metadata: Record<string, unknown> } {
  const metadata = asPlainRecord((value as Record<string, unknown>).metadata)
  return {
    ...value,
    metadata: {
      ...metadata,
      discussion_phase: discussionPhase,
    },
  }
}
