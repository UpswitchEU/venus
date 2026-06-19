import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../lib/auth'
import { useSessionStore } from '../store/useSessionStore'
import { generalLogger } from '../utils/logger'
import type { Stage } from './ValuationSessionManager.stage'

export function useSessionManagerTimeouts({
  hasSession,
  isBootstrapping,
  isDelegatedAccountantHandoff,
  isInitializing,
  isLoading,
  reportId,
  stage,
  status,
}: {
  hasSession: boolean
  isBootstrapping: boolean
  isDelegatedAccountantHandoff: boolean
  isInitializing: boolean
  isLoading: boolean
  reportId: string
  stage: Stage
  status: string
}): boolean {
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false)

  useEffect(() => {
    if (isLoading || isInitializing) {
      const warningTimer = setTimeout(() => {
        setShowTimeoutWarning(true)
        generalLogger.warn('[SessionManager] Loading taking longer than expected', {
          reportId,
          status,
          isLoading,
          isInitializing,
        })
      }, 10000)

      return () => clearTimeout(warningTimer)
    }
    setShowTimeoutWarning(false)
  }, [status, reportId, isInitializing, isLoading])

  const loadingTimeoutSnapshotRef = useRef({
    status,
    isBootstrapping,
    hasSession,
  })
  useEffect(() => {
    loadingTimeoutSnapshotRef.current = {
      status,
      isBootstrapping,
      hasSession,
    }
  }, [status, isBootstrapping, hasSession])

  useEffect(() => {
    if (stage !== 'loading') return

    const maxLoadingTimer = setTimeout(() => {
      const snapshot = loadingTimeoutSnapshotRef.current
      generalLogger.error('[SessionManager] Max loading time exceeded', {
        reportId,
        status: snapshot.status,
        isBootstrapping: snapshot.isBootstrapping,
        hasSession: snapshot.hasSession,
      })

      const authError = useAuthStore.getState().error?.trim()
      const timeoutMessage =
        isDelegatedAccountantHandoff && authError
          ? authError
          : 'Loading took too long. Please try refreshing the page.'

      useSessionStore.setState({
        status: 'error',
        errorMessage: timeoutMessage,
      })
    }, 30000)

    return () => clearTimeout(maxLoadingTimer)
  }, [stage, reportId, isDelegatedAccountantHandoff])

  return showTimeoutWarning
}
