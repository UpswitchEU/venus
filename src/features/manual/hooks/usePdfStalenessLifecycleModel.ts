import type { ValuationReportData } from '@/components/calculator'
import { APIError } from '@/types/errors'
import { isPdfTransientUpstreamStatus } from '@/utils/pdfTransientUpstream'
import { isPdfLikelyStaleVenus } from '../utils/isPdfLikelyStaleVenus'

export const PDF_STALE_POLL_INTERVAL_MS = 2_500
export const PDF_STALE_POLL_MAX_MS = 120_000
export const PDF_STALE_WAIT_TIMEOUT_MS = 60_000
/** Extend the stall deadline when Titan is transiently unavailable (503 pooler blips). */
export const PDF_STALE_WAIT_EXTENSION_MS = 20_000
export const PDF_STALE_WAIT_MAX_MS = 180_000
/** 12 polls x 2.5s = 30s of unchanged pdf_generated_at before surfacing the stalled banner. */
export const PDF_STALE_UNCHANGED_STREAK_THRESHOLD = 12

export function isTransientPollError(err: unknown): boolean {
  return err instanceof APIError && isPdfTransientUpstreamStatus(err.statusCode)
}

export function derivePdfStale({
  report,
  isPdfReady,
  pdfGenerationUrl,
}: {
  report: ValuationReportData | null | undefined
  isPdfReady: boolean
  pdfGenerationUrl?: string | null
}): boolean {
  if (!report) return false
  const stale = isPdfLikelyStaleVenus(report)
  if (!stale) return false
  // Local PDF hook finished — trust the client render until Titan row catches up.
  if (isPdfReady && pdfGenerationUrl) return false
  if (isPdfReady && report.pdfGeneratedAt == null) return false
  return true
}

export function getPdfWaitDelayMs(waitExtensionMs: number): number {
  return Math.min(PDF_STALE_WAIT_MAX_MS, PDF_STALE_WAIT_TIMEOUT_MS + waitExtensionMs)
}

export function getNextPdfWaitExtensionMs(currentWaitExtensionMs: number): number {
  return Math.min(
    PDF_STALE_WAIT_MAX_MS - PDF_STALE_WAIT_TIMEOUT_MS,
    currentWaitExtensionMs + PDF_STALE_WAIT_EXTENSION_MS
  )
}

export function getBySession404BackoffDelayMs(streak: number): number {
  return Math.min(60_000, PDF_STALE_POLL_INTERVAL_MS * 2 ** Math.min(Math.max(1, streak) - 1, 5))
}

export function getTransientPollBackoffDelayMs(streak: number): number {
  return Math.min(30_000, PDF_STALE_POLL_INTERVAL_MS * 2 ** Math.min(Math.max(1, streak) - 1, 4))
}
