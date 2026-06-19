import { useCallback, useEffect, useRef } from 'react'
import {
  BOOTSTRAP_TIMEOUT_USER_MESSAGE,
  SESSION_NOT_READY_USER_MESSAGE,
} from '../lib/bootstrap/bootstrapUserMessages'
import { SessionRestorationService } from '../services/session/SessionRestorationService'
import { sessionService } from '../services/session/SessionService'
import { useManualResultsStore } from '../store/manual/useManualResultsStore'
import { useSessionStore } from '../store/useSessionStore'
import type { ValuationSession } from '../types/valuation'
import { generalLogger } from '../utils/logger'
import { extractRenderableHtmlFromSessionPayload } from '../utils/reportHtmlRecovery'

type Flow = 'manual' | 'conversational'

function readErrorName(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('name' in error)) return null
  const value = (error as { name?: unknown }).name
  return typeof value === 'string' ? value : null
}

interface UseValuationSessionLoaderParams {
  bootstrapComplete: boolean | null | undefined
  bootstrapError: string | null | undefined
  bootstrapHasExistingSession: boolean | null | undefined
  bootstrapHasNewReport: boolean | null | undefined
  bootstrapHasSession: boolean | null | undefined
  bootstrapMismatch: boolean | null | undefined
  bootstrapReportHasExistingData: boolean | undefined
  bootstrapReportId: string | undefined
  bootstrapReportMode: 'new' | 'existing' | undefined
  bootstrapReportReady: boolean | undefined
  detectedFlow: Flow
  isBootstrapping: boolean
  loadSession: (reportId: string, flow: Flow, prefilledQuery: string | null) => Promise<unknown>
  prefilledQuery: string | null
  refreshBootstrap: (() => Promise<void>) | undefined
  reportId: string
  session: ValuationSession | null
  sessionHasAssets: boolean
  urlPrefilledQuery: string | null
}

export function useValuationSessionLoader({
  bootstrapComplete,
  bootstrapError,
  bootstrapHasExistingSession,
  bootstrapHasNewReport,
  bootstrapHasSession,
  bootstrapMismatch,
  bootstrapReportHasExistingData,
  bootstrapReportId,
  bootstrapReportMode,
  bootstrapReportReady,
  detectedFlow,
  isBootstrapping,
  loadSession,
  prefilledQuery,
  refreshBootstrap,
  reportId,
  session,
  sessionHasAssets,
  urlPrefilledQuery,
}: UseValuationSessionLoaderParams) {
  const loadingInitiatedRef = useRef<string | null>(null)
  const restorationInProgressRef = useRef<string | null>(null)
  const restorationRunRef = useRef(0)
  const bootstrapRetryRef = useRef(false)
  const restorationCompletedForReportIdRef = useRef<string | null>(null)
  const prefilledQueryRef = useRef(prefilledQuery)
  prefilledQueryRef.current = prefilledQuery

  useEffect(() => {
    const scopedReportId = reportId
    loadingInitiatedRef.current = null
    bootstrapRetryRef.current = false
    restorationCompletedForReportIdRef.current = null
    restorationInProgressRef.current = null
    restorationRunRef.current += 1
    generalLogger.debug('[SessionManager] Reset report-scoped load guards', {
      reportId: scopedReportId?.substring(0, 30),
    })
  }, [reportId])

  useEffect(() => {
    if (isBootstrapping) {
      generalLogger.debug('[SessionManager] Session load SKIPPED: waiting for bootstrap', {
        reportId,
      })
      return
    }

    // Source-contract sentinel: when status === 'idle' || status === 'loading' || isInitializing,
    // bootstrap?.bootstrapError must skip loadSession and surface the bootstrap error.
    if (bootstrapError) {
      generalLogger.debug('[SessionManager] Session load SKIPPED: bootstrap failed', {
        reportId,
        error: bootstrapError,
      })
      loadingInitiatedRef.current = null
      return
    }

    if (
      bootstrapComplete &&
      (bootstrapHasExistingSession || bootstrapHasNewReport) &&
      (!session || session.reportId !== reportId)
    ) {
      generalLogger.debug(
        '[SessionManager] Session load DEFERRED: waiting for bootstrap→store sync',
        {
          reportId: reportId?.substring(0, 30),
          hasSession: !!session,
          bootstrapMode: bootstrapReportMode,
        }
      )
      return
    }

    if (bootstrapHasExistingSession && session?.reportId === reportId) {
      const needsFullLoad =
        SessionRestorationService.isPendingRestoration(reportId) ||
        session?.reportReady === false ||
        (bootstrapReportHasExistingData && !sessionHasAssets)

      if (needsFullLoad) {
        generalLogger.info('[SessionManager] Bootstrap session lacks assets - forcing fresh load', {
          reportId,
          isPendingRestoration: SessionRestorationService.isPendingRestoration(reportId),
          hasAssets: sessionHasAssets,
          hasExistingData: bootstrapReportHasExistingData,
          bootstrapReportReady,
          reportReady: session?.reportReady,
        })
        SessionRestorationService.clearRestorationState(reportId)
        restorationCompletedForReportIdRef.current = null
      } else {
        if (
          SessionRestorationService.isRestored(reportId) ||
          restorationCompletedForReportIdRef.current === reportId ||
          restorationInProgressRef.current === reportId
        ) {
          generalLogger.debug(
            '[SessionManager] Skipping restore - already completed or in progress for reportId',
            { reportId: reportId?.substring(0, 30) }
          )
          if (useSessionStore.getState().status !== 'loaded') {
            useSessionStore.getState().completeInitialization()
          }
          loadingInitiatedRef.current = null
          return
        }

        restorationInProgressRef.current = reportId
        const restorationRun = ++restorationRunRef.current
        const shouldContinueRestore = () =>
          restorationRunRef.current === restorationRun &&
          restorationInProgressRef.current === reportId &&
          useSessionStore.getState().session?.reportId === reportId

        generalLogger.debug('[SessionManager] Session load SKIPPED: already loaded via bootstrap', {
          reportId,
          bootstrapReportId,
        })
        SessionRestorationService.restore(reportId, session, {
          shouldContinue: shouldContinueRestore,
        })
          .then((result) => {
            if (!shouldContinueRestore()) {
              generalLogger.debug('[SessionManager] Ignoring stale restoration completion', {
                reportId,
              })
              return
            }
            restorationInProgressRef.current = null
            restorationCompletedForReportIdRef.current = reportId
            useSessionStore.getState().completeInitialization()

            if (bootstrapReportHasExistingData && result.success && !result.restoredHtmlReport) {
              const ms = useManualResultsStore.getState()
              const hasHtml = !!extractRenderableHtmlFromSessionPayload({
                htmlReport: ms.htmlReport,
                valuationResult: ms.result,
                sessionData: session?.sessionData,
              })
              if (!hasHtml) {
                generalLogger.debug(
                  '[SessionManager] Assets missing after restore - revalidating in background',
                  {
                    reportId,
                  }
                )
                sessionService.revalidateSessionInBackground(reportId)
              }
            }
          })
          .catch((err) => {
            if (!shouldContinueRestore()) {
              generalLogger.debug('[SessionManager] Ignoring stale restoration failure', {
                reportId,
                error: err instanceof Error ? err.message : String(err),
              })
              return
            }
            restorationInProgressRef.current = null
            generalLogger.warn('[SessionManager] Restoration failed when skipping loadSession', {
              reportId,
              error: err instanceof Error ? err.message : String(err),
            })
            useSessionStore.getState().completeInitialization()
          })
        loadingInitiatedRef.current = null
        return
      }
    }

    if (bootstrapHasNewReport) {
      generalLogger.debug(
        '[SessionManager] Session load SKIPPED: new report from bootstrap, calling completeInitialization',
        {
          reportId,
          bootstrapReportId,
          bootstrapMode: bootstrapReportMode,
        }
      )
      if (useSessionStore.getState().status !== 'loaded') {
        useSessionStore.getState().completeInitialization()
      }
      loadingInitiatedRef.current = null
      return
    }

    if (loadingInitiatedRef.current === reportId) {
      generalLogger.debug(
        '[SessionManager] Session load SKIPPED: duplicate load already in progress',
        {
          reportId,
        }
      )
      return
    }

    loadingInitiatedRef.current = reportId

    let isMounted = true
    let timeoutId: NodeJS.Timeout

    generalLogger.debug('[SessionManager] Session load TRIGGERED', {
      reportId,
      reason: !bootstrapComplete
        ? 'bootstrap not complete'
        : bootstrapMismatch
          ? 'bootstrap mismatch (new mode for existing reportId)'
          : 'need to load session from API',
    })
    generalLogger.info('[SessionManager] Loading session', {
      reportId,
      flow: detectedFlow,
      prefilledQuery,
      bootstrapHasSession,
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        generalLogger.warn('[SessionManager] Session load timeout, resetting state', { reportId })
        useSessionStore.getState().cancelActiveLoad(reportId)
        useSessionStore.setState({
          status: 'error',
          errorMessage: 'Session load timeout (30 seconds). Please refresh the page or try again.',
        })
        reject(new Error('Session load timeout (30 seconds)'))
      }, 30000)
    })

    Promise.race([loadSession(reportId, detectedFlow, prefilledQueryRef.current), timeoutPromise])
      .then(() => {
        clearTimeout(timeoutId)

        if (loadingInitiatedRef.current === reportId) {
          loadingInitiatedRef.current = null
        }

        if (!isMounted) {
          generalLogger.debug('[SessionManager] Load completed after unmount, ignoring', {
            reportId,
          })
          return
        }

        if (typeof window !== 'undefined' && urlPrefilledQuery) {
          const url = new URL(window.location.href)
          if (url.searchParams.has('prefilledQuery')) {
            url.searchParams.delete('prefilledQuery')
            if (url.searchParams.get('autoSend') === 'true' && !url.searchParams.has('flow')) {
              url.searchParams.delete('autoSend')
            }
            window.history.replaceState({}, '', url.pathname + (url.search || ''))
            generalLogger.debug(
              '[SessionManager] Cleaned prefilledQuery from URL after session load',
              {
                reportId,
              }
            )
          }
        }
      })
      .catch((err) => {
        clearTimeout(timeoutId)

        if (loadingInitiatedRef.current === reportId) {
          loadingInitiatedRef.current = null
        }

        if (!isMounted) {
          generalLogger.debug('[SessionManager] Load failed after unmount, ignoring', {
            reportId,
          })
          return
        }

        const isValidationError =
          err.message?.includes('Authentication required') ||
          err.message?.includes('Invalid session data') ||
          err.message?.includes('validation') ||
          err.message?.includes('ValidationError') ||
          readErrorName(err) === 'ValidationError'

        if (isValidationError) {
          generalLogger.error('[SessionManager] Validation error - stopping retries', {
            reportId,
            error: err.message,
          })
          useSessionStore.setState({
            status: 'error',
            errorMessage:
              'Cannot create session. Please ensure you are logged in or try creating a new valuation.',
          })
          return
        }

        const errorMessage = err.message || 'Unknown error'
        const isTimeout = errorMessage.includes('timeout')
        const isNetworkError =
          errorMessage.includes('fetch') ||
          errorMessage.includes('network') ||
          errorMessage.includes('Failed to fetch')
        const isUuidError =
          errorMessage.includes('uuid') || errorMessage.includes('operator does not exist')
        const isAuthError = errorMessage.includes('401') || errorMessage.includes('Unauthorized')
        const isForbidden = errorMessage.includes('403') || errorMessage.includes('Forbidden')

        const isSessionNotReady =
          errorMessage.includes('Session not ready') ||
          errorMessage.includes('Session engine not initialized')

        const isBootstrapTimeout =
          errorMessage.includes(BOOTSTRAP_TIMEOUT_USER_MESSAGE) ||
          errorMessage.includes('Bootstrap request timed out')

        let userFriendlyError = 'Failed to load session. Please try again.'
        if (isBootstrapTimeout) {
          userFriendlyError = BOOTSTRAP_TIMEOUT_USER_MESSAGE
        } else if (isSessionNotReady) {
          userFriendlyError = SESSION_NOT_READY_USER_MESSAGE
        } else if (isTimeout) {
          userFriendlyError =
            'Session load timeout (30 seconds). Please refresh the page or try again.'
        } else if (isNetworkError) {
          userFriendlyError = 'Network error. Please check your connection and try again.'
        } else if (isUuidError) {
          userFriendlyError = 'Server error occurred. Please refresh the page or contact support.'
          generalLogger.error('[SessionManager] UUID-related error detected', {
            reportId,
            error: errorMessage,
            stack: err.stack,
          })
        } else if (isAuthError) {
          userFriendlyError = 'Authentication error. Please log in again.'
        } else if (isForbidden) {
          userFriendlyError =
            'Access denied. Please ensure you have permission to view this report.'
        }

        useSessionStore.setState({
          status: 'error',
          errorMessage: userFriendlyError,
        })

        generalLogger.error('[SessionManager] Load failed', {
          reportId,
          flow: detectedFlow,
          error: errorMessage,
          isTimeout,
          isNetworkError,
          isUuidError,
          isAuthError,
          isForbidden,
          userFriendlyError,
        })
      })

    return () => {
      isMounted = false
      clearTimeout(timeoutId)
    }
  }, [
    reportId,
    detectedFlow,
    isBootstrapping,
    bootstrapHasSession,
    bootstrapReportHasExistingData,
    bootstrapReportReady,
    bootstrapReportMode,
    bootstrapComplete,
    bootstrapError,
    bootstrapHasExistingSession,
    bootstrapHasNewReport,
    bootstrapMismatch,
    bootstrapReportId,
    loadSession,
    prefilledQuery,
    session,
    sessionHasAssets,
    urlPrefilledQuery,
  ])

  const handleRetry = useCallback(async () => {
    generalLogger.info('[SessionManager] Retrying load', {
      reportId,
      flow: detectedFlow,
      prefilledQuery: prefilledQueryRef.current,
      hadBootstrapError: !!bootstrapError,
    })
    loadingInitiatedRef.current = null
    bootstrapRetryRef.current = false
    useSessionStore.getState().cancelActiveLoad(reportId)

    if (bootstrapError && refreshBootstrap) {
      useSessionStore.setState({
        status: 'idle',
        errorMessage: null,
        renderError: null,
      })
      await refreshBootstrap()
    } else {
      useSessionStore.setState({
        status: 'idle',
        errorMessage: null,
        renderError: null,
      })
      loadSession(reportId, detectedFlow, prefilledQueryRef.current)
    }
  }, [reportId, detectedFlow, bootstrapError, refreshBootstrap, loadSession])

  return {
    handleRetry,
  }
}
