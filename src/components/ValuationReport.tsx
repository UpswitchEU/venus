'use client'

import { useRouter } from 'next/navigation'
import React, { Suspense, useEffect } from 'react'
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
 */
interface ValuationReportProps {
  reportId: string
  /** Initial mode (edit = editable form, view = static report) */
  initialMode?: 'edit' | 'view'
  /** Initial version number to load */
  initialVersion?: number
  /** URL parameters for context (clientToken, return_url, etc.) */
  urlParams?: Record<string, string | undefined>
}

export const ValuationReport: React.FC<ValuationReportProps> = React.memo(
  ({
    reportId,
    initialMode = 'edit', // Default to edit mode for M&A workflow
    initialVersion,
    urlParams = {},
  }) => {
    const router = useRouter()

    // Embedded mode detection for iframe integration
    const { isEmbedded } = useEmbeddedMode()

    // URL state management for browser navigation support
    const { urlState, updateUrl } = useUrlState({
      reportId,
      onStateChange: (state) => {
        // URL changed via browser navigation - component will re-render with new props
        // The ValuationFlowSelector will handle the state change
        generalLogger.debug('[ValuationReport] URL state changed', {
          reportId,
          mode: state.mode,
          version: state.version,
          flow: state.flow,
        })
      },
    })

    // Sync initial mode and version to URL on mount
    useEffect(() => {
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
    }, []) // Only on mount

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

    return (
      <div
        className={`flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 ${isEmbedded ? 'embedded-mode' : ''}`}
      >
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-screen bg-zinc-950">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-300 text-lg font-medium">Initializing valuation tool...</p>
                <p className="text-gray-500 text-sm mt-2">This will only take a moment</p>
              </div>
            </div>
          }
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
              />
            )}
          </ValuationSessionManager>
        </Suspense>
      </div>
    )
  }
)

ValuationReport.displayName = 'ValuationReport'
