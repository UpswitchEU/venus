import { useCallback, useEffect, useState } from 'react'
import {
  ACCOUNTING_RECONNECT_STATUS_EVENT,
  readAccountingReconnectIntentSummary,
} from '../utils/accountingReconnectResume'

type ReconnectContext = Record<string, unknown> | null

/** Recovery UI belongs to one report and client, just like the saved draft. */
export function useAccountingReconnectContext(reportId: string, clientId?: string | null) {
  const [state, setState] = useState<{
    reportId: string
    clientId?: string | null
    context: ReconnectContext
  } | null>(null)
  const setAccountingReconnectContext = useCallback(
    (context: ReconnectContext) => {
      setState({ reportId, clientId, context })
    },
    [reportId, clientId]
  )
  const handleAccountingReconnectRecovered = useCallback(
    () => setAccountingReconnectContext(null),
    [setAccountingReconnectContext]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const restore = () => {
      let summary = null
      try {
        summary = readAccountingReconnectIntentSummary(window.sessionStorage)
      } catch {
        /* unavailable browser storage */
      }
      if (!summary || summary.reportId !== reportId || summary.clientId !== clientId) {
        setAccountingReconnectContext(null)
        return
      }
      setAccountingReconnectContext({
        provider: summary.provider,
        client_id: summary.clientId,
        firm_id: summary.firmId,
        reason_code: summary.reasonCode,
        last_successful_sync_at: summary.lastSuccessfulSyncAt,
        recovery_phase: summary.phase,
        failure: summary.failure,
      })
    }
    restore()
    // Event payloads are notifications, not a second source of recovery state.
    window.addEventListener(ACCOUNTING_RECONNECT_STATUS_EVENT, restore)
    return () => window.removeEventListener(ACCOUNTING_RECONNECT_STATUS_EVENT, restore)
  }, [reportId, clientId, setAccountingReconnectContext])

  return {
    accountingReconnectContext:
      state?.reportId === reportId && state.clientId === clientId ? state.context : null,
    setAccountingReconnectContext,
    handleAccountingReconnectRecovered,
  }
}
