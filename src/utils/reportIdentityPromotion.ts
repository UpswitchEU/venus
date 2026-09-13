import type { SaveValuationResultResponse } from '../types/api-responses'
import type { ValuationResponse } from '../types/valuation'
import { isSessionKey, isUuid } from './identifiers'
import { reportAccessScope } from './reportAccessScope'

const REPORT_ALIAS_PREFIX = 'upswitch:report-alias:v2:'
// Used only when browser storage is unavailable; still isolated by user/client.
const memoryAliases = new Map<string, string>()
export const REPORT_IDENTITY_PROMOTED_EVENT = 'upswitch:report-identity-promoted'

export type ReportIdentity = {
  sessionKey?: string
  reportId?: string
  engineRunId?: string
}

export type ReportIdentityPromotedDetail = ReportIdentity & {
  previousId: string
}

function validEngineRunId(value: unknown): string | undefined {
  return typeof value === 'string' && /^val_[A-Za-z0-9_-]+$/.test(value) ? value : undefined
}

function engineRunIdFromResult(value: Partial<ValuationResponse> | undefined): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as unknown as Record<string, unknown>
  return validEngineRunId(record.valuation_id)
}

export function getCanonicalReportAlias(sessionKey: string): string | undefined {
  if (typeof window === 'undefined' || !isSessionKey(sessionKey)) return undefined
  const key = `${REPORT_ALIAS_PREFIX}${reportAccessScope()}:${sessionKey}`
  try {
    const stored = window.localStorage.getItem(key)
    return isUuid(stored) ? (stored ?? undefined) : undefined
  } catch {
    return memoryAliases.get(key)
  }
}

/**
 * Resolve Titan's three independent identities and persist only the safe
 * sessionKey -> report UUID alias. Invalid UUIDs or engine ids are never
 * silently substituted across identity domains.
 */
export function resolveSavedReportIdentity(input: {
  previousId: string
  response: SaveValuationResultResponse
  valuationResult?: Partial<ValuationResponse>
}): ReportIdentity {
  const reportId = isUuid(input.response.reportId) ? input.response.reportId : undefined
  const sessionKey = isSessionKey(input.response.sessionKey)
    ? input.response.sessionKey
    : isSessionKey(input.previousId)
      ? input.previousId
      : undefined
  const engineRunId =
    validEngineRunId(input.response.engineRunId) ?? engineRunIdFromResult(input.valuationResult)

  const identity: ReportIdentity = {
    ...(sessionKey ? { sessionKey } : {}),
    ...(reportId ? { reportId } : {}),
    ...(engineRunId ? { engineRunId } : {}),
  }

  return identity
}

/** Emit only after the caller has hydrated the saved report and bootstrap caches. */
export function rememberSavedReportAlias(
  input: Parameters<typeof resolveSavedReportIdentity>[0]
): ReportIdentity {
  const identity = resolveSavedReportIdentity(input)
  const { reportId, sessionKey } = identity
  if (typeof window !== 'undefined' && reportId && sessionKey) {
    const key = `${REPORT_ALIAS_PREFIX}${reportAccessScope()}:${sessionKey}`
    try {
      window.localStorage.setItem(key, reportId)
      memoryAliases.delete(key)
    } catch {
      memoryAliases.set(key, reportId)
    }
  }
  return identity
}

export function isSameReportIdentity(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false
  return (getCanonicalReportAlias(left) ?? left) === (getCanonicalReportAlias(right) ?? right)
}

export function promoteSavedReportIdentity(
  input: Parameters<typeof resolveSavedReportIdentity>[0]
): ReportIdentity {
  const identity = rememberSavedReportAlias(input)
  if (typeof window !== 'undefined' && identity.reportId && identity.sessionKey) {
    window.dispatchEvent(
      new CustomEvent<ReportIdentityPromotedDetail>(REPORT_IDENTITY_PROMOTED_EVENT, {
        detail: { previousId: input.previousId, ...identity },
      })
    )
  }

  return identity
}
