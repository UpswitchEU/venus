import { isSessionKey, isUuid } from '@/utils/identifiers'

interface ManualSessionIdentifierLike {
  reportId?: string | null
  key?: string | null
  session_key?: string | null
}

function getManualSessionIdentifier(session: unknown): ManualSessionIdentifierLike | null {
  if (!session || typeof session !== 'object') return null
  return session as ManualSessionIdentifierLike
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

export function resolveManualReportId(reportId: string, session: unknown): string {
  const sessionIdentifiers = getManualSessionIdentifier(session)
  const sessionReportId = nonEmptyString(sessionIdentifiers?.reportId)
  const sessionKey = getManualSessionKey(session)

  if (!reportId) return reportId
  if (reportId === 'new' && sessionReportId) return sessionReportId
  if (reportId === 'new' && sessionKey && sessionKey.length >= 8) return sessionKey
  if (reportId.startsWith('val_') && sessionReportId) return sessionReportId
  return reportId
}

export function resolveManualPersistedReportLookupId(args: {
  session: unknown
  resolvedReportId: string | null | undefined
  reportId: string | null | undefined
}): string | null {
  const sessionIdentifiers = getManualSessionIdentifier(args.session)
  const candidates = [sessionIdentifiers?.reportId, args.resolvedReportId, args.reportId]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && isUuid(candidate)) return candidate
  }
  return null
}

export function resolveManualReportHydrationLookupId(args: {
  session: unknown
  resolvedReportId: string | null | undefined
  reportId: string | null | undefined
}): string | null {
  const sessionIdentifiers = getManualSessionIdentifier(args.session)
  const candidates = [
    sessionIdentifiers?.reportId,
    args.resolvedReportId,
    args.reportId,
    sessionIdentifiers?.key,
    sessionIdentifiers?.session_key,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && (isUuid(candidate) || isSessionKey(candidate))) {
      return candidate
    }
  }
  return null
}

export function manualSessionMatchesReport(session: unknown, reportId: string): boolean {
  const sessionIdentifiers = getManualSessionIdentifier(session)
  if (!sessionIdentifiers) return false
  return (
    sessionIdentifiers.reportId === reportId ||
    sessionIdentifiers.key === reportId ||
    sessionIdentifiers.session_key === reportId
  )
}

export function getManualSessionKey(session: unknown): string | null {
  const sessionIdentifiers = getManualSessionIdentifier(session)
  return nonEmptyString(sessionIdentifiers?.key) ?? nonEmptyString(sessionIdentifiers?.session_key)
}

export function resolveManualCanonicalReportId(args: {
  targetReportId?: string | null
  session: unknown
  resolvedReportId?: string | null
  routeReportId?: string | null
  resultValuationId?: string | null
  activeSessionKey?: string | null
}): string | null {
  const targetReportId = nonEmptyString(args.targetReportId)
  if (targetReportId && isUuid(targetReportId)) return targetReportId

  const sessionIdentifiers = getManualSessionIdentifier(args.session)
  const uuidCandidates = [
    sessionIdentifiers?.reportId,
    args.resolvedReportId,
    args.resultValuationId,
    args.routeReportId,
  ]
  for (const candidate of uuidCandidates) {
    if (typeof candidate === 'string' && isUuid(candidate)) return candidate
  }

  if (targetReportId && targetReportId !== 'new' && !isSessionKey(targetReportId)) {
    return targetReportId
  }

  const sessionCandidates = [
    args.activeSessionKey,
    sessionIdentifiers?.key,
    sessionIdentifiers?.session_key,
    args.routeReportId,
    targetReportId,
  ]
  for (const candidate of sessionCandidates) {
    if (typeof candidate === 'string' && isSessionKey(candidate)) return candidate
  }

  return null
}
