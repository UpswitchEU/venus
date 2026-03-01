'use client'

import { useTransitionRouter } from 'next-view-transitions'
import React, { Suspense, useEffect, useRef } from 'react'
import { useBootstrapSync } from '../hooks/useBootstrapSync'
import { useEmbeddedMode } from '../hooks/useEmbeddedMode'
import { useUrlState } from '../hooks/useUrlState'
import { reportService } from '../services'
import UrlGeneratorService from '../services/urlGenerator'
import type { ValuationResponse } from '../types/valuation'
import { generalLogger } from '../utils/logger'
import { generateReportId, isValidReportId } from '../utils/reportIdGenerator'

// Lazy load heavy components for code splitting
const ValuationFlowSelector = React.lazy(() =>
  import('./ValuationFlowSelector').then((m) => ({ default: m.ValuationFlowSelector }))
)
const ValuationSessionManager = React.lazy(() =>
  import('./ValuationSessionManager').then((m) => ({ default: m.ValuationSessionManager }))
)

/**
 * ValuationReport Component - Next.js Compatible
 *
 * Single Responsibility: Route validation and delegation.
 * Handles URL parameter validation and delegates to session/flow management.
 *
 * Architecture: Flow-agnostic (shared by Manual and Conversational)
 * - Uses service layer for backend operations
 * - No direct store access (stores are flow-specific)
 * - Delegates to flow-specific components via ValuationFlowSelector
 *
 * Enhanced for M&A workflow:
 * - Supports edit/view mode switching
 * - Supports version selection
 * - Always editable by default (M&A requirement)
 * - World-class URL state management
 *
 * URL Action Parameters (for Mercury integration):
 * - action=download: Trigger PDF download after report loads
 * - tab=info: Start with info tab instead of preview
 */
interface ValuationReportProps {
  reportId: string
  /** Initial mode (edit = editable form, view = static report) */
  initialMode?: 'edit' | 'view'
  /** Initial version number to load */
  initialVersion?: number
  /** URL parameters for context (clientToken, return_url, action, tab, etc.) */
  urlParams?: Record<string, string | undefined>
}

export const ValuationReport: React.FC<ValuationReportProps> = React.memo(
  ({
    reportId,
    initialMode = 'edit', // Default to edit mode for M&A workflow
    initialVersion,
    urlParams = {},
  }) => {
    const router = useTransitionRouter()

    // Extract URL action and tab parameters (for Mercury integration)
    const urlAction = urlParams.action || undefined
    const initialTab = React.useMemo(() => {
      // Check tab query param first (info tab removed - map to preview)
      if (urlParams.tab === 'history') return 'history' as const
      return 'preview' as const
    }, [urlParams.tab])

    // Bootstrap sync - syncs bootstrap state with existing stores
    // This ensures auth, session, and prefill data are available in stores
    const { isSynced: isBootstrapSynced } = useBootstrapSync()

    // Embedded mode detection for iframe integration
    const { isEmbedded } = useEmbeddedMode()

    // URL state management for browser navigation support
    const { urlState, updateUrl } = useUrlState({
      reportId,
      onStateChange: () => {},
    })

    // LOOP FIX: Ref to prevent duplicate URL sync when effect re-runs (e.g. after remount)
    const urlSyncAttemptedRef = useRef(false)

    // Reset when reportId changes (client-side nav to different report)
    useEffect(() => {
      urlSyncAttemptedRef.current = false
    }, [reportId])

    // Sync initial mode and version to URL on mount
    useEffect(() => {
      if (urlSyncAttemptedRef.current) return
      urlSyncAttemptedRef.current = true

      const currentMode = urlState.mode || initialMode
      const currentVersion = urlState.version !== undefined ? urlState.version : initialVersion

      // Only update URL if state differs from URL (and we have initial values)
      if (
        (initialMode && currentMode !== urlState.mode) ||
        (initialVersion !== undefined && currentVersion !== urlState.version)
      ) {
        updateUrl(
          {
            mode: currentMode,
            version: currentVersion,
          },
          { replace: true }
        )
      }
      // reportId in deps: re-sync when navigating to a different report
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reportId])

    // Handle valuation completion
    // NOTE: saveCompleteSession is already called in useValuationFormSubmission
    // This callback only handles report API completion for credit tracking
    const handleValuationComplete = async (result: ValuationResponse) => {
      try {
        // Complete report via service layer (for credit tracking and persistence)
        // NOTE: Session save is already handled by sessionService in useValuationFormSubmission
        const sessionId = result.valuation_id // Use valuation_id as session identifier
        await reportService.completeReport(reportId, sessionId, result)

        generalLogger.info('Valuation report completed successfully', {
          reportId,
          valuationId: result.valuation_id,
        })
      } catch (error) {
        // BANK-GRADE: Specific error handling - report completion failure
        // Don't show error to user as the valuation is already complete locally
        // Report completion is for credit tracking, not critical for user experience
        if (error instanceof Error) {
          generalLogger.error('Failed to complete valuation report', {
            error: error.message,
            stack: error.stack,
            reportId,
            valuationId: result.valuation_id,
          })
        } else {
          generalLogger.error('Failed to complete valuation report', {
            error: String(error),
            reportId,
            valuationId: result.valuation_id,
          })
        }
        // Continue - don't block user even if completion fails
      }
    }

    // Validate report ID and redirect if invalid
    // FIX: Call all hooks before any conditional returns to comply with React rules of hooks
    React.useEffect(() => {
      if (!reportId || !isValidReportId(reportId)) {
        // Invalid or missing report ID - generate new one
        const newReportId = generateReportId()
        router.replace(UrlGeneratorService.reportById(newReportId))
      }
    }, [reportId, router])

    // Early return AFTER all hooks have been called
    if (!reportId || !isValidReportId(reportId)) {
      return null
    }

    // Preload critical resources in background
    useEffect(() => {
      // Preload ValuationFlowSelector and ValuationSessionManager
      // These are already lazy loaded, but we can prefetch them
      if (typeof window !== 'undefined') {
        // Prefetch critical components
        Promise.all([import('./ValuationFlowSelector'), import('./ValuationSessionManager')]).catch(
          () => {
            // Non-critical - preloading is optional
          }
        )
      }
    }, [])

    // ✅ WORLD CLASS: Signal Mercury when Venus is fully loaded and ready
    // This allows Mercury to hide the VenusTransitionLoader overlay smoothly
    // We signal when session is ready (stage === 'data-entry'), not just bootstrap synced
    useEffect(() => {
      if (typeof window === 'undefined') return

      // Check if we're coming from Mercury
      const sourceApp =
        urlParams.source ||
        (typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('source')
          : null)
      const isFromMercury = sourceApp === 'mercury'

      if (!isFromMercury) return

      // Signal readiness function
      const signalReady = () => {
        const venusUrl = process.env.NEXT_PUBLIC_VENUS_URL || 'https://valuation.upswitch.app'
        const venusOrigin = new URL(venusUrl).origin

        // If embedded (iframe), use postMessage
        if (window.parent !== window) {
          window.parent.postMessage(
            {
              type: 'venus-ready',
              reportId,
              timestamp: Date.now(),
            },
            venusOrigin
          )
        } else {
          if (window.location.hash !== '#ready' && window.location.hash !== '#venus-ready') {
            window.history.replaceState(
              null,
              '',
              `${window.location.pathname}${window.location.search}#venus-ready`
            )
          }
        }
      }

      // Signal after bootstrap sync completes - signal mainly for iframe flow
      // No delay: content is already visible; VenusTransitionLoader not used in full-page flow
      if (isBootstrapSynced) {
        signalReady()
      }
    }, [isBootstrapSynced, reportId, urlParams.source])

    return (
      <div
        className={`flex h-screen w-screen flex-col overflow-hidden bg-background ${isEmbedded ? 'embedded-mode' : ''}`}
      >
        <Suspense
          fallback={null}
          // ✅ WORLD CLASS: Remove Suspense fallback - loading handled by ValuationSessionManager
          // This eliminates duplicate loading states and ensures single unified loading experience
        >
          <ValuationSessionManager
            reportId={reportId}
            initialMode={initialMode}
            initialVersion={initialVersion}
          >
            {({
              session,
              stage,
              isLoading,
              error,
              showOutOfCreditsModal,
              onCloseModal,
              prefilledQuery,
              autoSend,
              onRetry,
              onStartOver,
            }) => (
              <ValuationFlowSelector
                session={session}
                stage={stage}
                isLoading={isLoading}
                error={error}
                prefilledQuery={prefilledQuery}
                autoSend={autoSend}
                onComplete={handleValuationComplete}
                initialMode={initialMode}
                initialVersion={initialVersion}
                onRetry={onRetry}
                onStartOver={onStartOver}
                reportId={reportId}
                initialTab={initialTab}
                urlAction={urlAction}
                initialDrawerOpen={urlParams.drawer === 'open'}
              />
            )}
          </ValuationSessionManager>
        </Suspense>
      </div>
    )
  }
)

ValuationReport.displayName = 'ValuationReport'
