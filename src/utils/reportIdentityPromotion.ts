import type { SaveValuationResultResponse } from '../types/api-responses'
import type { ValuationResponse } from '../types/valuation'
import { isSessionKey, isUuid } from './identifiers'

const REPORT_ALIAS_PREFIX = 'upswitch:report-alias:v1:'
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
  try {
    const stored = window.localStorage.getItem(`${REPORT_ALIAS_PREFIX}${sessionKey}`)
    return isUuid(stored) ? (stored ?? undefined) : undefined
  } catch {
    return undefined
  }
}

/**
 * Resolve Titan's three independent identities and persist only the safe
 * sessionKey -> report UUID alias. Invalid UUIDs or engine ids are never
 * silently substituted across identity domains.
 */
export function promoteSavedReportIdentity(input: {
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

  if (typeof window !== 'undefined' && reportId && sessionKey) {
    try {
      window.localStorage.setItem(`${REPORT_ALIAS_PREFIX}${sessionKey}`, reportId)
    } catch {
      // Storage can be disabled. The in-page promotion event still keeps this
      // successful save on its canonical UUID.
    }
    window.dispatchEvent(
      new CustomEvent<ReportIdentityPromotedDetail>(REPORT_IDENTITY_PROMOTED_EVENT, {
        detail: { previousId: input.previousId, ...identity },
      })
    )
  }

  return identity
}
