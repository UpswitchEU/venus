import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { RecentValuation } from '../../../components/calculator'
import { useClientContext } from '../../../stores/clientContext'
import { generalLogger } from '../../../utils/logger'
import {
  buildManualRecentValuations,
  mapReportsResponseToRecentValuations,
} from '../utils/manualRecentValuations'

export interface UseManualRecentValuationsParams {
  reportId: string
  resolvedReportId?: string | null
  sessionReportId?: string | null
  activeSessionKey?: string | null
  sessionName?: string | null
  sessionUpdatedAt?: unknown
  sessionCreatedAt?: unknown
  currentReport?: {
    companyName?: string | null
    generatedAt?: Date | null
  } | null
  collectedCompanyName?: string | null
  isAccountantFlow: boolean
  clientCompanyName?: string | null
  unnamedLabel: string
}

export interface UseManualRecentValuationsResult {
  rawRecentValuations: RecentValuation[]
  setRawRecentValuations: Dispatch<SetStateAction<RecentValuation[]>>
  fetchRecentValuations: () => void
  recentValuations: RecentValuation[]
}

export function useManualRecentValuations({
  reportId,
  resolvedReportId,
  sessionReportId,
  activeSessionKey,
  sessionName,
  sessionUpdatedAt,
  sessionCreatedAt,
  currentReport,
  collectedCompanyName,
  isAccountantFlow,
  clientCompanyName,
  unnamedLabel,
}: UseManualRecentValuationsParams): UseManualRecentValuationsResult {
  const [rawRecentValuations, setRawRecentValuations] = useState<RecentValuation[]>([])

  const fetchRecentValuations = useCallback(() => {
    const headers: HeadersInit = {}
    try {
      const ctx = useClientContext.getState()
      if (ctx.isActingAsClient && ctx.getContextHeaders) {
        Object.assign(headers, ctx.getContextHeaders())
      }
    } catch {
      // clientContext not available.
    }

    fetch('/api/reports?limit=5&offset=0', {
      credentials: 'include',
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    })
      .then((res) => (res.ok ? res.json() : { reports: [] }))
      .then((data) => {
        setRawRecentValuations(mapReportsResponseToRecentValuations(data, { unnamedLabel }))
      })
      .catch((err) => {
        generalLogger.warn('[ManualLayout] Failed to load recent valuations', {
          error: err instanceof Error ? err.message : String(err),
        })
      })
  }, [unnamedLabel])

  useEffect(() => {
    fetchRecentValuations()
  }, [fetchRecentValuations])

  const recentValuations = useMemo(() => {
    return buildManualRecentValuations({
      rawRecentValuations,
      reportId,
      resolvedReportId,
      sessionReportId,
      activeSessionKey,
      sessionName,
      sessionUpdatedAt,
      sessionCreatedAt,
      currentReport,
      collectedCompanyName,
      isAccountantFlow,
      clientCompanyName,
      unnamedLabel,
    })
  }, [
    activeSessionKey,
    clientCompanyName,
    collectedCompanyName,
    currentReport,
    isAccountantFlow,
    rawRecentValuations,
    reportId,
    resolvedReportId,
    sessionCreatedAt,
    sessionName,
    sessionReportId,
    sessionUpdatedAt,
    unnamedLabel,
  ])

  return {
    rawRecentValuations,
    setRawRecentValuations,
    fetchRecentValuations,
    recentValuations,
  }
}
