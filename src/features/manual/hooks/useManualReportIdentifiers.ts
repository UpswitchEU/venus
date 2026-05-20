import { useMemo } from 'react'
import { isSessionKey, isUuid } from '../../../utils/identifiers'
import {
  resolveManualCanonicalReportId,
  resolveManualPersistedReportLookupId,
  resolveManualReportHydrationLookupId,
  resolveManualReportId,
} from '../utils/manualSessionIdentifiers'

export interface ManualReportIdentifiers {
  calculationRequestIdentifiers: {
    reportId?: string
    sessionKey?: string
  }
  linkedIdentifier: string | null
  manualChatReportId: string
  persistedReportLookupId: string | null
  reportHydrationLookupId: string | null
  resolvedReportId: string
}

export interface UseManualReportIdentifiersParams {
  activeSessionKey: string | null
  reportId: string
  resultValuationId?: string | null
  session: unknown
}

export function useManualReportIdentifiers({
  activeSessionKey,
  reportId,
  resultValuationId,
  session,
}: UseManualReportIdentifiersParams): ManualReportIdentifiers {
  const resolvedReportId = useMemo(() => {
    return resolveManualReportId(reportId, session)
  }, [reportId, session])

  const manualChatReportId = useMemo(() => {
    return (
      resolveManualCanonicalReportId({
        session,
        resolvedReportId,
        routeReportId: reportId,
        resultValuationId,
        activeSessionKey,
      }) ??
      resolvedReportId ??
      reportId
    )
  }, [activeSessionKey, reportId, resolvedReportId, resultValuationId, session])

  const linkedIdentifier = useMemo(() => {
    const id = resolvedReportId || reportId
    if (!id || id === 'new' || typeof id !== 'string') return null
    return id
  }, [resolvedReportId, reportId])

  const calculationRequestIdentifiers = useMemo(
    () => ({
      reportId:
        linkedIdentifier && (isUuid(linkedIdentifier) || isSessionKey(linkedIdentifier))
          ? linkedIdentifier
          : undefined,
      sessionKey: linkedIdentifier && isSessionKey(linkedIdentifier) ? linkedIdentifier : undefined,
    }),
    [linkedIdentifier]
  )

  const persistedReportLookupId = useMemo(() => {
    return resolveManualPersistedReportLookupId({ session, resolvedReportId, reportId })
  }, [session, resolvedReportId, reportId])

  const reportHydrationLookupId = useMemo(() => {
    return resolveManualReportHydrationLookupId({ session, resolvedReportId, reportId })
  }, [session, resolvedReportId, reportId])

  return {
    calculationRequestIdentifiers,
    linkedIdentifier,
    manualChatReportId,
    persistedReportLookupId,
    reportHydrationLookupId,
    resolvedReportId,
  }
}
