import { useTranslations } from 'next-intl'
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Switch } from '../../design-system/components/Switch'
import { trackOwnerProfilingCapBindRendered } from '../../lib/analytics'
import { useSessionStore } from '../../store/useSessionStore'
import { isBuyerReadinessPackage } from '../../types/buyerReadiness'
import type { ValuationResponse } from '../../types/valuation'
import { extractEvEquityWaterfallSteps } from '../../utils/extractEvEquityWaterfallSteps'
import { HTMLProcessor } from '../../utils/htmlProcessor'
import { generalLogger } from '../../utils/logger'
import { deriveOwnerProfilingState } from '../../utils/ownerProfiling/coverChip'
import { getFirstRenderableReportHtml } from '../../utils/safetyNetReportHtml'
import { ErrorState } from '../ErrorState'
import { ReportSkeleton } from '../skeletons/ReportSkeleton'
import { BuyerReadinessPanel } from './BuyerReadinessPanel'
import { EnterpriseEquityWaterfallChart } from './EnterpriseEquityWaterfallChart'
import { OwnerProfilingPeerPanel } from './OwnerProfilingPeerPanel'
import { OwnerProfilingReportChip } from './OwnerProfilingReportChip'
import { OwnerProfilingSkippedWatermark } from './OwnerProfilingSkippedWatermark'

interface ResultsComponentProps {
  result?: ValuationResponse | null
}

function readEnterpriseBridgePreference(source?: Record<string, unknown> | null): boolean | null {
  if (!source) return null
  if (typeof source.show_enterprise_to_equity_bridge === 'boolean') {
    return source.show_enterprise_to_equity_bridge
  }
  const metadata = source.metadata
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>).show_enterprise_to_equity_bridge
    if (typeof value === 'boolean') return value
  }
  const reportContext = source.report_context
  if (reportContext && typeof reportContext === 'object' && !Array.isArray(reportContext)) {
    const value = (reportContext as Record<string, unknown>).show_enterprise_to_equity_bridge
    if (typeof value === 'boolean') return value
  }
  const details = source.details
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    const nestedContext = (details as Record<string, unknown>).report_context
    if (nestedContext && typeof nestedContext === 'object' && !Array.isArray(nestedContext)) {
      const value = (nestedContext as Record<string, unknown>).show_enterprise_to_equity_bridge
      if (typeof value === 'boolean') return value
    }
  }
  return null
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
  const sessionShowEnterpriseBridge = useSessionStore((state) => {
    const sessionData = state.session?.sessionData as Record<string, unknown> | undefined
    return sessionData?.show_enterprise_to_equity_bridge
  })
  const sessionReportId = useSessionStore((state) => state.session?.reportId ?? null)
  const sessionEngine = useSessionStore((state) => state.engine)
  const updateSessionData = useSessionStore((state) => state.updateSessionData)
  const saveSession = useSessionStore((state) => state.saveSession)
  const sessionWaterfall = useSessionStore((state) =>
    extractEvEquityWaterfallSteps(state.session?.valuationResult as ValuationResponse | undefined)
  )
  const [localEnterpriseBridgePreference, setLocalEnterpriseBridgePreference] = useState<
    boolean | null
  >(null)

  const sessionValuationResult = useSessionStore((state) =>
    state.session?.valuationResult
      ? (state.session.valuationResult as ValuationResponse)
      : undefined
  )
  const sessionBuyerReadiness = useSessionStore((state) => {
    const direct = state.session?.buyerReadiness
    if (isBuyerReadinessPackage(direct)) return direct
    const fromSessionData = (state.session?.sessionData as Record<string, unknown> | undefined)
      ?._buyerReadiness
    return isBuyerReadinessPackage(fromSessionData) ? fromSessionData : null
  })

  const ownerProfilingState = useMemo(
    () => deriveOwnerProfilingState(sessionValuationResult, result ?? undefined),
    [sessionValuationResult, result]
  )

  // DATA-1 — peer panel inputs. Source order: session result → response,
  // matching the chip's own session-preferred resolution. A stale `result`
  // never wins over a fresh session payload; that prevents rendering a
  // peer comparison from one valuation alongside a chip from another.
  const peerPanelInputs = useMemo(() => {
    const source = sessionValuationResult ?? result ?? undefined
    if (!source) {
      return {
        businessTypeId: null as string | null,
        countryCode: null as string | null,
        userTri: null as number | null,
        valuationId: null as string | null,
      }
    }
    const businessTypeId =
      typeof source.business_type === 'string' && source.business_type.length > 0
        ? source.business_type
        : typeof source.industry === 'string' && source.industry.length > 0
          ? source.industry
          : null
    // `country_code` is not on the typed ValuationResponse contract but
    // the Python engine emits it when the request carries it; cast and
    // narrow safely here (mirrors submitAnonymizedBenchmarkContribution).
    const ccRaw = (source as unknown as Record<string, unknown>).country_code
    const cc =
      typeof ccRaw === 'string' && ccRaw.trim().length === 2 ? ccRaw.trim().toUpperCase() : ''
    const countryCode = cc.length === 2 ? cc : null
    const userTri =
      ownerProfilingState?.mode === 'chip'
        ? ownerProfilingState.chip.transferabilityRiskIndex
        : null
    // Withdraw flow needs the originating valuation_id (Venus pins
    // `contributor_reference = valuation_id` at submit time).
    const valuationId =
      typeof source.valuation_id === 'string' && source.valuation_id.length > 0
        ? source.valuation_id
        : null
    return { businessTypeId, countryCode, userTri, valuationId }
  }, [ownerProfilingState, result, sessionValuationResult])

  // Prefer session HTML, but do not let legacy safety-net HTML mask a real result report.
  const htmlReport = getFirstRenderableReportHtml(sessionHtmlReport, result?.html_report)
  const evEquitySteps = sessionWaterfall ?? extractEvEquityWaterfallSteps(result ?? undefined)
  const showEnterpriseBridge = useMemo(() => {
    if (typeof localEnterpriseBridgePreference === 'boolean') return localEnterpriseBridgePreference
    if (typeof sessionShowEnterpriseBridge === 'boolean') return sessionShowEnterpriseBridge
    return (
      readEnterpriseBridgePreference(sessionValuationResult as unknown as Record<string, unknown>) ??
      readEnterpriseBridgePreference(result as unknown as Record<string, unknown>) ??
      true
    )
  }, [localEnterpriseBridgePreference, sessionShowEnterpriseBridge, sessionValuationResult, result])
  const hasEvEquitySteps = !!(evEquitySteps && evEquitySteps.length > 0)
  const showEnterpriseBridgeToolbar = !!htmlReport || hasEvEquitySteps
  const handleEnterpriseBridgeToggle = useCallback(
    (checked: boolean) => {
      setLocalEnterpriseBridgePreference(checked)

      if (!sessionReportId || !sessionEngine) return

      void (async () => {
        try {
          await updateSessionData({ show_enterprise_to_equity_bridge: checked })
          await saveSession('user')
        } catch (error) {
          generalLogger.warn('Failed to persist Enterprise-to-Equity bridge preference', {
            reportId: sessionReportId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      })()
    },
    [saveSession, sessionEngine, sessionReportId, updateSessionData]
  )
  const enterpriseBridgeToolbar = showEnterpriseBridgeToolbar ? (
    <div className="rounded-lg border border-foreground/10 bg-background/90 px-3 py-2 shadow-sm">
      <Switch
        size="sm"
        checked={showEnterpriseBridge}
        onChange={handleEnterpriseBridgeToggle}
        label={t('enterpriseBridgeToggle')}
        description={t('enterpriseBridgeToggleDescription')}
        aria-label={t('enterpriseBridgeToggle')}
      />
    </div>
  ) : null

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

  // Owner Profiling cap-bind telemetry (OWNER-PROFILING-1 / OP-6).
  // Fires once per (report_id, capped chip) — re-renders, tab switches and
  // session updates that don't change the underlying chip should NOT
  // double-fire the funnel event. The dedup ref tracks the last keyed
  // emission rather than the chip identity so a true state transition
  // (chip → no chip → chip) re-fires cleanly.
  const lastCapBindKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (ownerProfilingState?.mode !== 'chip') {
      lastCapBindKeyRef.current = null
      return
    }
    const chip = ownerProfilingState.chip
    if (chip.mode !== 'capped') {
      lastCapBindKeyRef.current = null
      return
    }
    const reportId = result?.valuation_id || sessionValuationResult?.valuation_id || ''
    if (!reportId) return
    const key = `${reportId}::${chip.appliedAdjustment}::${chip.rawAdjustment}`
    if (lastCapBindKeyRef.current === key) return
    lastCapBindKeyRef.current = key
    trackOwnerProfilingCapBindRendered({
      reportId,
      mode: 'cover_chip',
      riskLevel: chip.riskLevel,
      appliedPct: Math.round(chip.appliedAdjustment * 100),
      rawPct: Math.round(chip.rawAdjustment * 100),
    })
  }, [ownerProfilingState, result?.valuation_id, sessionValuationResult?.valuation_id])

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
  // or owner-profiling-only payloads (session.valuationResult without HTML yet).
  if (!htmlReport) {
    const hasBand = !!(
      sessionBuyerReadiness ||
      ownerProfilingState ||
      hasEvEquitySteps ||
      showEnterpriseBridgeToolbar
    )

    if (hasBand) {
      return (
        <div
          className="valuation-report-container h-full overflow-y-auto bg-background"
          data-show-enterprise-bridge={showEnterpriseBridge ? 'true' : 'false'}
        >
          <div className="mx-auto max-w-4xl space-y-3 px-4 pt-4">
            {enterpriseBridgeToolbar}
            <BuyerReadinessPanel readiness={sessionBuyerReadiness} />
            {ownerProfilingState?.mode === 'chip' ? (
              <OwnerProfilingReportChip chip={ownerProfilingState.chip} />
            ) : null}
            {ownerProfilingState?.mode === 'skipped' ? <OwnerProfilingSkippedWatermark /> : null}
            <OwnerProfilingPeerPanel
              businessTypeId={peerPanelInputs.businessTypeId}
              countryCode={peerPanelInputs.countryCode}
              userTri={peerPanelInputs.userTri}
              valuationId={peerPanelInputs.valuationId}
            />
            {showEnterpriseBridge && hasEvEquitySteps ? (
              <EnterpriseEquityWaterfallChart steps={evEquitySteps} />
            ) : null}
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
    <div
      className="valuation-report-container h-full overflow-y-auto bg-background"
      data-show-enterprise-bridge={showEnterpriseBridge ? 'true' : 'false'}
    >
      <style>
        {`
          .valuation-report-container[data-show-enterprise-bridge="false"] .valuation-report .ev-equity-bridge-section,
          .valuation-report-container[data-show-enterprise-bridge="false"] .valuation-report .ev-equity-waterfall-section {
            display: none !important;
          }
        `}
      </style>
      {(sessionBuyerReadiness ||
        ownerProfilingState ||
        hasEvEquitySteps ||
        showEnterpriseBridgeToolbar) && (
        <div className="mx-auto max-w-4xl space-y-3 px-4 pt-4">
          {enterpriseBridgeToolbar}
          <BuyerReadinessPanel readiness={sessionBuyerReadiness} />
          {ownerProfilingState?.mode === 'chip' ? (
            <OwnerProfilingReportChip chip={ownerProfilingState.chip} />
          ) : null}
          {ownerProfilingState?.mode === 'skipped' ? <OwnerProfilingSkippedWatermark /> : null}
          <OwnerProfilingPeerPanel
            businessTypeId={peerPanelInputs.businessTypeId}
            countryCode={peerPanelInputs.countryCode}
            userTri={peerPanelInputs.userTri}
          />
          {showEnterpriseBridge && hasEvEquitySteps ? (
            <EnterpriseEquityWaterfallChart steps={evEquitySteps} />
          ) : null}
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
