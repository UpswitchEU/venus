import { AlertCircle, Loader2 } from 'lucide-react'
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
  if (!report || !pdfStale) return null

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
        </div>
      ) : null}
    </div>
  )
}
