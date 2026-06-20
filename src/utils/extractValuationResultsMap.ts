/**
 * Client-side parity with Titan `extractValuationResultsMap`.
 * Legacy payloads may store `{}` at `valuation_results` while real methods live under
 * `details`, `report_context`, or nested `valuation_result`.
 *
 * When no path has a non-empty map but `report_context` still holds headline numbers, we synthesize
 * a minimal single-method map (same rules as Titan).
 *
 * Adaptive: `report_context.applied_multiple` is canonical; `normalizeAdaptiveMethod` fixes stale
 * persisted `upswitch_adaptive.multiple_used` on legacy saves.
 */
import type { ValuationMethodResult, ValuationResponse } from '@/types/valuation'
import { normalizeValuationResultEnvelope } from '@/utils/resolveAcademicValidationIssues'
import { withRevenueMethodAliases } from './valuationMethodAliases'
import { nestedRecord, type UnknownRecord } from './valuationResultExtractionPrimitives'
import {
  type ExtractValuationResultsContext,
  enrichDcfMethod,
  type MethodResultMap,
  normalizeAdaptiveMethod,
  pruneStaleDcfMethod,
  synthesizeMinimalValuationResultsMap,
} from './valuationResultsMapModel'

export {
  getValuationMethodResultForKey,
  hydratedRevenueMethodKeysAreSameRef,
  isDuplicateHydratedRevenueAliasEntry,
  isRevenueMethodologyKey,
  normalizeSelectedMethodKey,
  revenueMethodologySiblingKey,
} from './valuationMethodAliases'
export type { ExtractValuationResultsContext } from './valuationResultsMapModel'

/** Optional override when merging two payloads (e.g. session restore + in-memory result). */
export type HydrateClientValuationResultsOptions = {
  selectedValuationMethodOverride?: string | null
}

/**
 * Selected method for {@link extractValuationResultsMap} context when only nested fields are set.
 * Order: top-level → `report_context` → `details` → `details.report_context`.
 */
export function resolveSelectedValuationMethodForExtraction(
  valuationResult: unknown
): string | null {
  if (!valuationResult || typeof valuationResult !== 'object' || Array.isArray(valuationResult)) {
    return null
  }
  const root = valuationResult as Record<string, unknown>
  const pick = (v: unknown): string | null => {
    if (typeof v === 'string' && v.trim()) return v.trim()
    return null
  }

  const direct = pick(root['selected_valuation_method'])
  if (direct) return direct

  const rc = root['report_context']
  if (rc && typeof rc === 'object' && !Array.isArray(rc)) {
    const fromRc = pick((rc as Record<string, unknown>)['selected_valuation_method'])
    if (fromRc) return fromRc
  }

  const details = root['details']
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    const d = details as Record<string, unknown>
    const fromDetails = pick(d['selected_valuation_method'])
    if (fromDetails) return fromDetails
    const drc = d['report_context']
    if (drc && typeof drc === 'object' && !Array.isArray(drc)) {
      return pick((drc as Record<string, unknown>)['selected_valuation_method'])
    }
  }

  return null
}

/**
 * @param context When the API/report row has `selected_valuation_method` but nested JSON does not,
 * pass it so legacy synthesis picks the correct method key (parity with Titan).
 */
export function extractValuationResultsMap(
  valuationResult: UnknownRecord | null | undefined,
  context?: ExtractValuationResultsContext | null
): MethodResultMap | null {
  if (!valuationResult || typeof valuationResult !== 'object') return null

  const nested = nestedRecord(valuationResult, 'valuation_result')
  const details = nestedRecord(valuationResult, 'details')
  const nestedDetails = nestedRecord(nested, 'details')
  const reportContext = nestedRecord(valuationResult, 'report_context')
  const detailsReportContext = nestedRecord(details, 'report_context')
  const nestedReportContext = nestedRecord(nested, 'report_context')
  const nestedDetailsReportContext = nestedRecord(nestedDetails, 'report_context')

  const candidates = [
    valuationResult.valuation_results,
    details?.valuation_results,
    nested?.valuation_results,
    nestedDetails?.valuation_results,
    reportContext?.valuation_results,
    detailsReportContext?.valuation_results,
    nestedReportContext?.valuation_results,
    nestedDetailsReportContext?.valuation_results,
  ]

  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate) &&
      Object.keys(candidate).length > 0
    ) {
      const pruned = pruneStaleDcfMethod(
        normalizeAdaptiveMethod(candidate as MethodResultMap, valuationResult),
        valuationResult,
        context
      )
      if (!pruned) {
        continue
      }
      return withRevenueMethodAliases(enrichDcfMethod(pruned, valuationResult))
    }
  }

  return withRevenueMethodAliases(synthesizeMinimalValuationResultsMap(valuationResult, context))
}

/**
 * Single Venus entry point: {@link extractValuationResultsMap} with
 * {@link resolveSelectedValuationMethodForExtraction} + top-level `selected_valuation_method`.
 * Prefer this over ad-hoc context objects so Manual layout, stores, sessions, and benchmarks stay aligned.
 */
export function hydrateClientValuationResultsMap(
  valuationResult: unknown,
  options?: HydrateClientValuationResultsOptions | null
): Record<string, ValuationMethodResult> | null {
  if (!valuationResult || typeof valuationResult !== 'object' || Array.isArray(valuationResult)) {
    return null
  }
  const vr = valuationResult as UnknownRecord
  const selectedMethod =
    typeof vr.selected_valuation_method === 'string' ? vr.selected_valuation_method : null
  const selectedValuationMethod =
    options?.selectedValuationMethodOverride ??
    resolveSelectedValuationMethodForExtraction(valuationResult) ??
    selectedMethod
  const map = extractValuationResultsMap(vr, {
    selectedValuationMethod: selectedValuationMethod,
  })
  return (map as Record<string, ValuationMethodResult> | null) ?? null
}

function hasNonEmptyValuationResults(value: UnknownRecord): boolean {
  const vr = value.valuation_results
  return !!(vr && typeof vr === 'object' && !Array.isArray(vr) && Object.keys(vr).length > 0)
}

/**
 * Hoists a non-empty method map to top-level `valuation_results` when missing or empty.
 * Fixes legacy session rows where `{}` was stored at the top level but real data lived under
 * `details` / `report_context`. Parity with Titan `normalizeValuationResultWithMethodMap`.
 */
export function normalizeValuationResultWithMethodMap(
  value: UnknownRecord | null
): UnknownRecord | null {
  if (!value || typeof value !== 'object') return null

  const map = extractValuationResultsMap(value, null)
  if (!map) return value

  const withMap = hasNonEmptyValuationResults(value) ? value : { ...value, valuation_results: map }

  return normalizeValuationResultEnvelope(
    withMap as unknown as ValuationResponse
  ) as unknown as UnknownRecord
}
