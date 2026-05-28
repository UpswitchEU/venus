import type { ValuationResponse, ValuationSession } from '../types/valuation'
import {
  getEquityValueHigh,
  getEquityValueLow,
  getEquityValueMid,
} from './valuationResultAccess'
import { getFirstRenderableReportHtml } from './safetyNetReportHtml'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function pricingRangeHasValue(range: unknown): boolean {
  const record = asRecord(range)
  if (!record) return false
  return (
    toFiniteNumber(record.mid) != null ||
    toFiniteNumber(record.min) != null ||
    toFiniteNumber(record.max) != null
  )
}

export function extractRenderableHtmlFromSources(
  ...htmlReports: Array<string | null | undefined>
): string | undefined {
  return getFirstRenderableReportHtml(...htmlReports)
}

export function valuationSnapshotHasRange(valuationResult: unknown): boolean {
  if (
    getEquityValueMid(valuationResult) != null ||
    getEquityValueLow(valuationResult) != null ||
    getEquityValueHigh(valuationResult) != null
  ) {
    return true
  }

  const record = asRecord(valuationResult)
  if (!record) return false

  return (
    pricingRangeHasValue(record.pricing_range) ||
    pricingRangeHasValue(record.priceRange) ||
    pricingRangeHasValue(record._pricingRange)
  )
}

export function enrichRecoveryValuationSnapshot(
  session: ValuationSession | null | undefined,
  result: ValuationResponse | null | undefined
): Record<string, unknown> | null {
  const sessionData = asRecord(session?.sessionData)
  const fromSessionData = sessionData?.valuation_result ?? sessionData?.valuationResult
  const baseRecord = asRecord(result ?? session?.valuationResult ?? fromSessionData)
  const pricingRange =
    sessionData?._pricingRange ?? sessionData?.pricingRange ?? baseRecord?.pricing_range ?? baseRecord?.priceRange

  if (baseRecord) {
    if (valuationSnapshotHasRange(baseRecord) || !pricingRangeHasValue(pricingRange)) {
      return baseRecord
    }
    const pr = asRecord(pricingRange)
    if (!pr) return baseRecord
    return {
      ...baseRecord,
      equity_value_low: baseRecord.equity_value_low ?? pr.min,
      equity_value_mid: baseRecord.equity_value_mid ?? pr.mid,
      equity_value_high: baseRecord.equity_value_high ?? pr.max,
      pricing_range: baseRecord.pricing_range ?? pricingRange,
    }
  }

  if (pricingRangeHasValue(pricingRange)) {
    const pr = asRecord(pricingRange)!
    return {
      equity_value_low: pr.min,
      equity_value_mid: pr.mid,
      equity_value_high: pr.max,
      pricing_range: pricingRange,
    }
  }

  return null
}

export function mergeRecoveredHtmlIntoValuationSnapshot(
  base: ValuationResponse | Record<string, unknown>,
  html: string
): ValuationResponse {
  const baseRecord = base as Record<string, unknown>
  const existingDetails = asRecord(baseRecord.details)

  return {
    ...baseRecord,
    html_report: html,
    details: existingDetails ? { ...existingDetails, html_report: html } : { html_report: html },
  } as ValuationResponse
}

export function extractRenderableHtmlFromSessionPayload(session: {
  htmlReport?: string | null
  valuationResult?: unknown
  sessionData?: unknown
}): string | undefined {
  const valuationResult = asRecord(session.valuationResult)
  const sessionData = asRecord(session.sessionData)
  const detailsHtml =
    typeof valuationResult?.details === 'object' && valuationResult.details !== null
      ? (valuationResult.details as { html_report?: string }).html_report
      : undefined

  return extractRenderableHtmlFromSources(
    session.htmlReport,
    typeof valuationResult?.html_report === 'string' ? valuationResult.html_report : undefined,
    detailsHtml,
    typeof sessionData?._htmlReport === 'string' ? sessionData._htmlReport : undefined,
    typeof sessionData?.html_report === 'string' ? sessionData.html_report : undefined,
    typeof sessionData?.htmlReport === 'string' ? sessionData.htmlReport : undefined
  )
}

export function buildRecoveryEligibilitySession(
  session: ValuationSession,
  result?: ValuationResponse | null
): ValuationSession {
  const enrichedValuationResult = enrichRecoveryValuationSnapshot(session, result ?? null)

  return {
    ...session,
    valuationResult: enrichedValuationResult ?? session.valuationResult ?? result ?? null,
    htmlReport: session.htmlReport,
  } as ValuationSession
}

export function sessionPayloadNeedsRenderableHtmlRecovery(session: {
  valuationResult?: unknown
  htmlReport?: string | null
  sessionData?: unknown
}): boolean {
  if (!valuationSnapshotHasRange(session.valuationResult)) return false
  return !extractRenderableHtmlFromSessionPayload(session)
}

export function sessionNeedsRenderableHtmlRecovery(
  session: ValuationSession,
  result?: ValuationResponse | null
): boolean {
  const eligibilitySession = buildRecoveryEligibilitySession(session, result ?? null)
  if (!eligibilitySession.valuationResult) return false
  return sessionPayloadNeedsRenderableHtmlRecovery(eligibilitySession)
}

export function isTransientEnsureHtmlSkipStatus(response: Record<string, unknown>): boolean {
  const status = typeof response.status === 'string' ? response.status : null
  return status === 'skipped_recent_failure'
}

export function clearHtmlFromMissingRestorationAssets(
  sessionData: Record<string, unknown>
): Record<string, unknown> {
  const missing = sessionData._missingRestorationAssets
  if (!Array.isArray(missing) || !missing.includes('html_report')) {
    return sessionData
  }

  const filtered = missing.filter((asset) => asset !== 'html_report')
  if (filtered.length === 0) {
    const { _missingRestorationAssets: _removed, ...rest } = sessionData
    return rest
  }

  return { ...sessionData, _missingRestorationAssets: filtered }
}

/**
 * When Titan self-heal hydrated HTML client-side but a concurrent loadSession
 * still returns a stale server snapshot (CAS miss / reportReady: false), keep
 * the recovered HTML instead of clobbering the right panel.
 */
export type ClientRecoveredHtmlFallback = {
  htmlReport?: string | null
  valuationResult?: unknown
}

function resolveClientRecoveredHtml(
  clientSession: ValuationSession | null | undefined,
  clientStoreFallback?: ClientRecoveredHtmlFallback
): string | undefined {
  const fromSession = clientSession
    ? extractRenderableHtmlFromSessionPayload(clientSession)
    : undefined
  if (fromSession) return fromSession
  if (!clientStoreFallback) return undefined
  return extractRenderableHtmlFromSessionPayload({
    htmlReport: clientStoreFallback.htmlReport,
    valuationResult: clientStoreFallback.valuationResult,
  })
}

export function preserveClientRecoveredHtmlWhenServerSessionStale(
  serverSession: ValuationSession,
  clientSession: ValuationSession | null | undefined,
  clientStoreFallback?: ClientRecoveredHtmlFallback
): ValuationSession {
  const clientHtml = resolveClientRecoveredHtml(clientSession, clientStoreFallback)
  if (!clientHtml) return serverSession

  const serverHtml = extractRenderableHtmlFromSessionPayload(serverSession)
  if (serverHtml) return serverSession

  const sessionData = clearHtmlFromMissingRestorationAssets({
    ...(asRecord(serverSession.sessionData) ?? {}),
    _htmlReport: clientHtml,
    htmlReport: clientHtml,
    html_report: clientHtml,
  })

  const baseValuation =
    serverSession.valuationResult ??
    clientSession?.valuationResult ??
    clientStoreFallback?.valuationResult ??
    asRecord(serverSession.sessionData)?.valuation_result ??
    asRecord(serverSession.sessionData)?.valuationResult

  return {
    ...serverSession,
    htmlReport: clientHtml,
    reportReady: true,
    valuationResult: mergeRecoveredHtmlIntoValuationSnapshot(
      (asRecord(baseValuation) ?? {}) as ValuationResponse,
      clientHtml
    ),
    sessionData: sessionData as ValuationSession['sessionData'],
  }
}
