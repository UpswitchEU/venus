import { useTranslations } from 'next-intl'
import React, { memo, useEffect } from 'react'
import { useSessionStore } from '../../store/useSessionStore'
import type { ValuationResponse } from '../../types/valuation'
import { extractEvEquityWaterfallSteps } from '../../utils/extractEvEquityWaterfallSteps'
import { HTMLProcessor } from '../../utils/htmlProcessor'
import { generalLogger } from '../../utils/logger'
import { getFirstRenderableReportHtml } from '../../utils/safetyNetReportHtml'
import { ErrorState } from '../ErrorState'
import { ReportSkeleton } from '../skeletons/ReportSkeleton'
import { EnterpriseEquityWaterfallChart } from './EnterpriseEquityWaterfallChart'

interface ResultsComponentProps {
  result?: ValuationResponse | null
}

/**
 * Results Component - Renders the Python-generated HTML valuation report.
 *
 * Wraps the sanitized HTML in a `.valuation-report` container to match
 * the `<body class="valuation-report">` from the Python Jinja2 template,
 * which DOMPurify strips during sanitization.
 *
 * Memoized to prevent unnecessary re-renders.
 */
const ResultsComponent: React.FC<ResultsComponentProps> = ({ result }) => {
  const t = useTranslations('reportPreview')
  // ROOT CAUSE FIX: Only subscribe to primitive values, not entire session object
  const isLoading = useSessionStore((state) => state.isLoading)
  const error = useSessionStore((state) => state.error)

  // BANK-GRADE FIX: Subscribe to session htmlReport to update when session loads
  // Previous approach used getState() which doesn't trigger re-renders
  const sessionHtmlReport = useSessionStore((state) => state.session?.htmlReport)
  const sessionWaterfall = useSessionStore((state) =>
    extractEvEquityWaterfallSteps(state.session?.valuationResult as ValuationResponse | undefined)
  )

  // Prefer session HTML, but do not let legacy safety-net HTML mask a real result report.
  const htmlReport = getFirstRenderableReportHtml(sessionHtmlReport, result?.html_report)
  const evEquitySteps = sessionWaterfall ?? extractEvEquityWaterfallSteps(result ?? undefined)

  // Verification logging: Track when result changes
  useEffect(() => {
    if (result) {
      generalLogger.info('Results component received result', {
        hasResult: true,
        valuationId: result.valuation_id,
        hasHtmlReport: !!htmlReport,
        htmlReportLength: htmlReport?.length || 0,
      })
    } else {
      generalLogger.warn('Results component has no result', {
        hasResult: false,
      })
    }
  }, [result, htmlReport])

  // Show loading skeleton while loading
  if (isLoading && !htmlReport) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] space-y-4">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-foreground/60 font-medium">{t('loadingReport')}</p>
        <ReportSkeleton />
      </div>
    )
  }

  // Show error state (Aurora design system)
  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px] p-4">
        <ErrorState title={t('failedToLoadReport')} message={error} />
      </div>
    )
  }

  // No HTML but we may still have EV→equity steps (e.g. report_context from Titan)
  if (!htmlReport) {
    if (evEquitySteps && evEquitySteps.length > 0) {
      return (
        <div className="valuation-report-container h-full overflow-y-auto bg-background">
          <div className="px-4 pt-4 max-w-4xl mx-auto">
            <EnterpriseEquityWaterfallChart steps={evEquitySteps} />
          </div>
          <div className="flex items-center justify-center min-h-[200px] px-4 pb-8">
            <div className="text-center text-foreground/50">
              <p className="font-medium">{t('reportNotAvailable')}</p>
              <p className="text-sm text-foreground/40 mt-1">{t('reportNotAvailableDesc')}</p>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center text-foreground/50">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-foreground/40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="font-medium">{t('reportNotAvailable')}</p>
          <p className="text-sm text-foreground/40 mt-1">{t('reportNotAvailableDesc')}</p>
        </div>
      </div>
    )
  }

  // BANK-GRADE: Sanitize HTML before rendering to prevent XSS attacks
  // HTML is server-generated from templates (not user input), but we sanitize for defense-in-depth
  const sanitizedHtml = HTMLProcessor.sanitize(htmlReport)

  return (
    <div className="valuation-report-container h-full overflow-y-auto bg-background">
      {evEquitySteps && evEquitySteps.length > 0 && (
        <div className="px-4 pt-4 max-w-4xl mx-auto">
          <EnterpriseEquityWaterfallChart steps={evEquitySteps} />
        </div>
      )}
      <div className="valuation-report">
        <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
      </div>
    </div>
  )
}

// BANK-GRADE: Memoized component to prevent unnecessary re-renders
// Zustand's selector optimization handles store-based re-renders efficiently
// This memo prevents re-renders from parent component updates
export const Results = memo(ResultsComponent)

Results.displayName = 'Results'

// Frontend is minimal - only displays final HTML report from backend
// All complex analysis components removed - calculations happen in Python
