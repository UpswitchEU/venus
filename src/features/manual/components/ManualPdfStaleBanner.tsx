import { AlertCircle, Loader2, X } from 'lucide-react'
import { useState } from 'react'
import type { ValuationReportData } from '../../../components/calculator'
import { AuroraButton } from '../../../design-system/components/Button'

interface ManualPdfStaleBannerProps {
  canDownloadPdf: boolean
  isPdfRetrying: boolean
  onRetry: () => Promise<void> | void
  persistedReportLookupId: string | null | undefined
  pdfPollErrorCount: number
  pdfStale: boolean
  pdfWaitTimedOut: boolean
  report: ValuationReportData | null
  translate: (key: string) => string
}

export function ManualPdfStaleBanner({
  canDownloadPdf,
  isPdfRetrying,
  onRetry,
  persistedReportLookupId,
  pdfPollErrorCount,
  pdfStale,
  pdfWaitTimedOut,
  report,
  translate,
}: ManualPdfStaleBannerProps) {
  // Dismissal is scoped to one stale cycle: the report itself is always
  // viewable in the panel, so the "couldn't refresh the downloadable PDF"
  // notice must be dismissible rather than perpetual when the backend can't
  // self-heal (e.g. a ValuationIQ signature mismatch). A fresh edit bumps
  // `reportUpdatedAt` → new cycle key → the notice re-arms automatically.
  const cycleKey = report?.reportUpdatedAt instanceof Date ? report.reportUpdatedAt.getTime() : 0
  const [dismissedCycleKey, setDismissedCycleKey] = useState<number | null>(null)

  if (!report || !pdfStale) return null

  // Only the "stalled" state is dismissible. The benign "updating" spinner
  // (not yet timed out) is transient and self-clears, so it always shows.
  if (pdfWaitTimedOut && dismissedCycleKey === cycleKey) return null

  const pollBlurb = pdfWaitTimedOut
    ? translate('pdfStalledBlurb')
    : pdfPollErrorCount >= 2
      ? translate('pdfPollDegradedHint')
      : translate('pdfUpdatingBlurb')

  return (
    <div
      role="status"
      className="shrink-0 border-b border-primary/20 bg-primary/[0.06] px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-3"
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {pdfWaitTimedOut ? (
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-primary" aria-hidden />
        ) : (
          <Loader2 className="w-4 h-4 shrink-0 mt-0.5 text-primary animate-spin" aria-hidden />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {pdfWaitTimedOut ? translate('pdfStalledTitle') : translate('pdfUpdating')}
          </p>
          <p className="text-[11px] text-foreground/55 mt-1 leading-snug">{pollBlurb}</p>
        </div>
      </div>
      {pdfWaitTimedOut ? (
        <div className="flex flex-wrap items-center gap-2 shrink-0 sm:ml-auto">
          <AuroraButton
            type="button"
            size="sm"
            variant="primary"
            loading={isPdfRetrying}
            disabled={isPdfRetrying || !persistedReportLookupId}
            onClick={() => void onRetry()}
          >
            {translate('pdfRetry')}
          </AuroraButton>
          {canDownloadPdf && report.pdfUrl ? (
            <AuroraButton
              type="button"
              size="sm"
              variant="outline"
              disabled={isPdfRetrying}
              onClick={() => {
                if (report.pdfUrl) window.open(report.pdfUrl, '_blank', 'noopener,noreferrer')
              }}
            >
              {translate('pdfOpenLastVersion')}
            </AuroraButton>
          ) : null}
          <button
            type="button"
            aria-label={translate('pdfDismiss')}
            title={translate('pdfDismiss')}
            className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/45 hover:text-foreground/70 hover:bg-foreground/[0.06] transition-colors"
            onClick={() => setDismissedCycleKey(cycleKey)}
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  )
}
