import { coalesceFiniteNumber } from '../../lib/omniPreview'
import type { ValuationResponse } from '../../types/valuation'
import { hydrateClientValuationResultsMap } from '../../utils/extractValuationResultsMap'
import { normalizeValuationResultEnvelope } from '../../utils/resolveAcademicValidationIssues'
import { getFirstRenderableReportHtml } from '../../utils/safetyNetReportHtml'

type SessionRecord = Record<string, unknown>

function isRecord(value: unknown): value is SessionRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown): SessionRecord | null {
  return isRecord(value) ? value : null
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export interface PricingRange {
  min: number
  mid: number
  max: number
  currency: string
}

function toPricingRange(value: unknown): PricingRange | null {
  const record = asRecord(value)
  if (!record) return null
  return {
    min: coalesceFiniteNumber(record.min),
    mid: coalesceFiniteNumber(record.mid),
    max: coalesceFiniteNumber(record.max),
    currency: optionalString(record.currency) ?? 'EUR',
  }
}

export function extractValuationResult(
  sessionData: SessionRecord,
  topLevelSession: SessionRecord
): ValuationResponse | null {
  const report = asRecord(topLevelSession.report)
  const candidates = [
    topLevelSession.valuationResult,
    sessionData.valuationResult,
    sessionData.valuation_result,
    topLevelSession.valuation_result,
    report?.valuation_result,
    report?.valuationResult,
  ]
    .filter(isRecord)
    .map((candidate) => candidate as unknown as ValuationResponse)

  if (candidates.length === 0) return null

  const scoreCandidate = (candidate: ValuationResponse) => {
    const record = candidate as unknown as SessionRecord
    const details = asRecord(record.details)
    let score = 0
    const valuationResultsCandidate = hydrateClientValuationResultsMap(candidate)
    if (valuationResultsCandidate) {
      score += 8
    }
    if (
      getFirstRenderableReportHtml(
        optionalString(record.html_report),
        optionalString(record.htmlReport),
        optionalString(details?.html_report)
      )
    ) {
      score += 4
    }
    if (
      candidate.equity_value_mid != null ||
      record.valuation_midpoint != null ||
      record.pricing_range ||
      record.priceRange
    ) {
      score += 2
    }
    score += Math.min(Object.keys(candidate).length, 5)
    return score
  }

  const best = candidates.reduce((winner, candidate) =>
    scoreCandidate(candidate) > scoreCandidate(winner) ? candidate : winner
  )
  return normalizeValuationResultEnvelope(best)
}

export function extractHtmlReport(
  sessionData: SessionRecord,
  topLevelSession: SessionRecord
): string | null {
  const valuationResult = extractValuationResult(sessionData, topLevelSession)
  const valuationDetails =
    valuationResult?.details && typeof valuationResult.details === 'object'
      ? (valuationResult.details as Record<string, unknown>)
      : null

  return (
    getFirstRenderableReportHtml(
      optionalString(topLevelSession.htmlReport),
      optionalString(sessionData.htmlReport),
      optionalString(sessionData.html_report),
      optionalString(topLevelSession.html_report),
      optionalString(sessionData._htmlReport),
      valuationResult?.html_report,
      valuationResult?.htmlReport,
      optionalString(valuationDetails?.html_report)
    ) || null
  )
}

export function extractPricingRange(
  sessionData: SessionRecord,
  topLevelSession: SessionRecord
): PricingRange | null {
  const valuationResult = extractValuationResult(sessionData, topLevelSession)
  const injectedPricingRange = toPricingRange(sessionData._pricingRange)
  if (injectedPricingRange) {
    return injectedPricingRange
  }

  const directPricingRange = toPricingRange(sessionData.priceRange)
  if (directPricingRange) {
    return directPricingRange
  }

  const valuationRecord = valuationResult ? (valuationResult as unknown as SessionRecord) : null

  const valuationPricingRange = toPricingRange(valuationRecord?.pricing_range)
  if (valuationPricingRange) {
    return valuationPricingRange
  }

  const valuationCamelPricingRange = toPricingRange(valuationRecord?.priceRange)
  if (valuationCamelPricingRange) {
    return valuationCamelPricingRange
  }

  if (valuationResult && valuationRecord) {
    const min = valuationResult.equity_value_low || valuationRecord.valuation_min
    const mid = valuationResult.equity_value_mid || valuationRecord.valuation_midpoint
    const max = valuationResult.equity_value_high || valuationRecord.valuation_max

    if (min !== undefined || mid !== undefined || max !== undefined) {
      return {
        min: coalesceFiniteNumber(min),
        mid: coalesceFiniteNumber(mid),
        max: coalesceFiniteNumber(max),
        currency: optionalString(valuationRecord.currency) ?? 'EUR',
      }
    }
  }

  return null
}
