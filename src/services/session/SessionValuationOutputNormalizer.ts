import { coalesceFiniteNumber } from '../../lib/omniPreview'
import type { PresentationContract, ValuationResponse } from '../../types/valuation'
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

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function positiveFiniteNumber(value: unknown): number | null {
  const numeric = finiteNumber(value)
  return numeric != null && numeric > 0 ? numeric : null
}

function midpointFromPositiveRange(min: number | null, max: number | null): number | null {
  if (min == null || max == null || min <= 0 || max <= 0) return null
  return Math.round((min + max) / 2)
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
  const min = finiteNumber(record.min)
  const max = finiteNumber(record.max)
  const rawMid = finiteNumber(record.mid)
  const mid = positiveFiniteNumber(rawMid) ?? midpointFromPositiveRange(min, max) ?? rawMid

  return {
    min: min ?? 0,
    mid: mid ?? 0,
    max: max ?? 0,
    currency: optionalString(record.currency) ?? 'EUR',
  }
}

const PRESENTATION_TIERS = ['indicative', 'defensible', 'attested'] as const
const PRESENTATION_DISPLAY_MODES = ['band_only', 'point_and_band'] as const
const PRESENTATION_POINT_BASES = ['none', 'policy', 'proven_calibration', 'attested'] as const

/**
 * BET-462 — defensively read the backend's presentation contract off a valuation
 * result. Returns null unless the tier, display and human copy are all well-formed
 * so a malformed payload can never over-state confidence — the surface then shows
 * nothing extra (gated render). Tolerates both `presentation_contract` (Venus snake
 * convention) and `presentationContract` (Titan camel) top-level keys, and a nested
 * `details.*` location. Honesty invariant: an `indicative` tier is ALWAYS coerced to
 * `band_only` regardless of the wire `display`.
 */
export function extractPresentationContract(
  result: ValuationResponse | null | undefined
): PresentationContract | null {
  if (!result) return null
  const record = result as unknown as SessionRecord
  const details = asRecord(record.details)
  const raw =
    asRecord(record.presentation_contract) ??
    asRecord((record as SessionRecord).presentationContract) ??
    asRecord(details?.presentation_contract) ??
    asRecord(details?.presentationContract)
  if (!raw) return null

  const tier = raw.tier
  if (typeof tier !== 'string' || !(PRESENTATION_TIERS as readonly string[]).includes(tier)) {
    return null
  }
  const typedTier = tier as PresentationContract['tier']

  const tierLabel = optionalString(raw.tierLabel)
  const confidenceLabel = optionalString(raw.confidenceLabel)
  const disclaimer = optionalString(raw.disclaimer)
  // Require the human-facing copy — a band with no honest label is worse than none.
  if (!tierLabel || !confidenceLabel || !disclaimer) return null

  const confidence = (['low', 'medium', 'high'] as const).includes(
    raw.confidence as PresentationContract['confidence']
  )
    ? (raw.confidence as PresentationContract['confidence'])
    : 'low'

  const wireDisplay = (PRESENTATION_DISPLAY_MODES as readonly string[]).includes(
    raw.display as string
  )
    ? (raw.display as PresentationContract['display'])
    : 'band_only'
  // Indicative is never a point — coerce defensively even if the wire disagrees.
  const display: PresentationContract['display'] =
    typedTier === 'indicative' ? 'band_only' : wireDisplay
  const showPointEstimate = display === 'point_and_band' && raw.showPointEstimate !== false

  const pointEstimateBasis = (PRESENTATION_POINT_BASES as readonly string[]).includes(
    raw.pointEstimateBasis as string
  )
    ? (raw.pointEstimateBasis as PresentationContract['pointEstimateBasis'])
    : showPointEstimate
      ? 'policy'
      : 'none'

  const rawFloor = typeof raw.bandFloorWidth === 'number' ? raw.bandFloorWidth : Number.NaN
  const bandFloorWidth = Number.isFinite(rawFloor) && rawFloor > 0 && rawFloor < 1 ? rawFloor : 0.3

  return {
    tier: typedTier,
    tierLabel,
    tierDescription: optionalString(raw.tierDescription) ?? '',
    display,
    showPointEstimate,
    pointEstimateBasis,
    bandFloorWidth,
    confidence,
    confidenceLabel,
    disclaimer,
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
    const min =
      finiteNumber(valuationResult.equity_value_low) ?? finiteNumber(valuationRecord.valuation_min)
    const max =
      finiteNumber(valuationResult.equity_value_high) ?? finiteNumber(valuationRecord.valuation_max)
    const rawMid =
      finiteNumber(valuationResult.equity_value_mid) ??
      finiteNumber(valuationRecord.valuation_midpoint)
    const mid = positiveFiniteNumber(rawMid) ?? midpointFromPositiveRange(min, max) ?? rawMid

    if (min != null || mid != null || max != null) {
      return {
        min: min ?? 0,
        mid: mid ?? 0,
        max: max ?? 0,
        currency: optionalString(valuationRecord.currency) ?? 'EUR',
      }
    }
  }

  return null
}
