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
import type { ValuationMethodResult } from '@/types/valuation'

export type ExtractValuationResultsContext = {
  selectedValuationMethod?: string | null
}

/** Optional override when merging two payloads (e.g. session restore + in-memory result). */
export type HydrateClientValuationResultsOptions = {
  selectedValuationMethodOverride?: string | null
}

/** The other NL/EN key for the same revenue-multiple methodology. */
export function revenueMethodologySiblingKey(
  key: string
): 'omzet_multiple' | 'revenue_multiple' | null {
  if (key === 'omzet_multiple') return 'revenue_multiple'
  if (key === 'revenue_multiple') return 'omzet_multiple'
  return null
}

/** Read method row from a hydrated map; `omzet_multiple` / `revenue_multiple` are aliases. */
export function getValuationMethodResultForKey(
  map: Record<string, ValuationMethodResult> | null | undefined,
  methodKey: string
): ValuationMethodResult | undefined {
  if (!map) return undefined
  const direct = map[methodKey]
  if (direct) return direct
  const sibling = revenueMethodologySiblingKey(methodKey)
  if (sibling) return map[sibling]
  return undefined
}

/**
 * After {@link withMethodAliases}, `revenue_multiple` may duplicate `omzet_multiple` by reference.
 * Skip copying/enumerating the EN key when merging UI rows.
 */
export function isDuplicateHydratedRevenueAliasEntry(
  map: Record<string, ValuationMethodResult | undefined>,
  key: string,
  method: ValuationMethodResult | undefined
): boolean {
  if (key !== 'revenue_multiple' || method == null) return false
  const omzet = map.omzet_multiple
  return omzet != null && omzet === method
}

/** True when both keys exist and reference the same hydrated row. */
export function hydratedRevenueMethodKeysAreSameRef(
  map: Record<string, ValuationMethodResult | undefined> | null | undefined
): boolean {
  if (!map || typeof map !== 'object') return false
  const omzet = map.omzet_multiple
  const revenue = map.revenue_multiple
  return omzet != null && revenue != null && omzet === revenue
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

const METHOD_KEY_ALIASES: Record<string, string> = {
  revenue_multiple: 'omzet_multiple',
}
const REVENUE_METHOD_KEYS = new Set(['omzet_multiple', 'revenue_multiple'])

export function isRevenueMethodologyKey(methodKey: string): boolean {
  return REVENUE_METHOD_KEYS.has(methodKey)
}

export function normalizeSelectedMethodKey(methodKey: unknown): string {
  if (methodKey == null) return ''
  const raw = String(methodKey).trim().toLowerCase().replace(/-/g, '_')
  const normalized = raw.split(/\s+/).join('_')
  return METHOD_KEY_ALIASES[normalized] || normalized
}

function isDcfMethodKey(methodKey: unknown): boolean {
  const normalized = normalizeSelectedMethodKey(methodKey)
  return (
    normalized === 'dcf' ||
    normalized === 'dcf_analysis' ||
    normalized === 'discounted_cash_flow' ||
    /^discounted_cash_flow_?\(?dcf\)?$/.test(normalized)
  )
}

function isHybridMethodKey(methodKey: unknown): boolean {
  const normalized = normalizeSelectedMethodKey(methodKey)
  return normalized === 'hybrid' || normalized === 'hybrid_dcf' || normalized === 'hybrid_valuation'
}

function withMethodAliases(map: Record<string, any> | null): Record<string, any> | null {
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    return map
  }
  if (map.omzet_multiple && !map.revenue_multiple) {
    return { ...map, revenue_multiple: map.omzet_multiple }
  }
  if (map.revenue_multiple && !map.omzet_multiple) {
    return { ...map, omzet_multiple: map.revenue_multiple }
  }
  return map
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function getCanonicalReportContext(
  valuationResult: Record<string, any>
): Record<string, any> | null {
  const vr = valuationResult.valuation_result
  const nested = vr && typeof vr === 'object' ? (vr as Record<string, any>) : null
  const candidates = [
    valuationResult.report_context,
    valuationResult.details?.report_context,
    nested?.report_context,
    nested?.details?.report_context,
  ]

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate as Record<string, any>
    }
  }
  return null
}

function getCanonicalDcfValuation(
  valuationResult: Record<string, any>
): Record<string, any> | null {
  const vr = valuationResult.valuation_result
  const nested = vr && typeof vr === 'object' ? (vr as Record<string, any>) : null
  const candidates = [
    valuationResult.dcf_valuation,
    valuationResult.details?.dcf_valuation,
    nested?.dcf_valuation,
    nested?.details?.dcf_valuation,
    valuationResult.report_context?.dcf_valuation,
    valuationResult.details?.report_context?.dcf_valuation,
    nested?.report_context?.dcf_valuation,
    nested?.details?.report_context?.dcf_valuation,
  ]

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate as Record<string, any>
    }
  }

  return null
}

function normalizeAdaptiveMethod(
  map: Record<string, any>,
  valuationResult: Record<string, any>
): Record<string, any> {
  const adaptive = map.upswitch_adaptive
  if (!adaptive || typeof adaptive !== 'object') return map

  const reportContext = getCanonicalReportContext(valuationResult)
  const canonicalMultiple =
    toFiniteNumber(reportContext?.applied_multiple) ??
    toFiniteNumber(valuationResult.valuation_result?.multiple) ??
    toFiniteNumber(valuationResult.multiple) ??
    null
  const multipleLow = toFiniteNumber(reportContext?.multiple_low)
  const multipleHigh = toFiniteNumber(reportContext?.multiple_high)
  const details =
    adaptive.details && typeof adaptive.details === 'object' && !Array.isArray(adaptive.details)
      ? { ...adaptive.details }
      : {}

  if (multipleLow != null && details.p25_multiple == null) {
    details.p25_multiple = multipleLow
  }
  if (multipleHigh != null && details.p75_multiple == null) {
    details.p75_multiple = multipleHigh
  }

  return {
    ...map,
    upswitch_adaptive: {
      ...adaptive,
      ...(canonicalMultiple != null ? { multiple_used: canonicalMultiple } : {}),
      details,
    },
  }
}

function enrichDcfMethod(
  map: Record<string, any>,
  valuationResult: Record<string, any>
): Record<string, any> {
  const dcf = map.dcf
  if (!dcf || typeof dcf !== 'object' || Array.isArray(dcf)) return map

  const dcfValuation = getCanonicalDcfValuation(valuationResult)
  if (!dcfValuation) return map

  const details =
    dcf.details && typeof dcf.details === 'object' && !Array.isArray(dcf.details)
      ? { ...dcf.details }
      : {}

  const enterpriseValue = toFiniteNumber(dcfValuation.enterprise_value)
  const wacc = toFiniteNumber(dcfValuation.wacc)
  const terminalValue = toFiniteNumber(dcfValuation.terminal_value)
  const terminalValuePct = toFiniteNumber(dcfValuation.terminal_value_pct_of_total)
  const explicitForecastPct = toFiniteNumber(dcfValuation.explicit_forecast_pct_of_total)
  const readiness =
    dcfValuation.historical_fcf_readiness &&
    typeof dcfValuation.historical_fcf_readiness === 'object' &&
    !Array.isArray(dcfValuation.historical_fcf_readiness)
      ? dcfValuation.historical_fcf_readiness
      : null

  if (details.enterprise_value == null && enterpriseValue != null) {
    details.enterprise_value = enterpriseValue
  }
  if (details.wacc == null && wacc != null) {
    details.wacc = wacc
  }
  if (details.terminal_value == null && terminalValue != null) {
    details.terminal_value = terminalValue
  }
  if (details.terminal_value_pct_of_total == null && terminalValuePct != null) {
    details.terminal_value_pct_of_total = terminalValuePct
  }
  if (details.explicit_forecast_pct_of_total == null && explicitForecastPct != null) {
    details.explicit_forecast_pct_of_total = explicitForecastPct
  }
  if (details.wacc_buildup == null && dcfValuation.wacc_buildup && typeof dcfValuation.wacc_buildup === 'object') {
    details.wacc_buildup = dcfValuation.wacc_buildup
  }
  if (details.historical_fcf_readiness == null && readiness) {
    details.historical_fcf_readiness = readiness
  }

  const midYear = dcfValuation.mid_year_discounting
  if (details.mid_year_discounting == null && typeof midYear === 'boolean') {
    details.mid_year_discounting = midYear
  }
  const periodsNote = dcfValuation.discount_periods_note
  if (details.discount_periods_note == null && periodsNote != null && periodsNote !== '') {
    details.discount_periods_note = periodsNote
  }
  const academicCoe = dcfValuation.academic_cost_of_equity_formula
  if (details.academic_cost_of_equity_formula == null && academicCoe != null && academicCoe !== '') {
    details.academic_cost_of_equity_formula = academicCoe
  }

  return {
    ...map,
    dcf: {
      ...dcf,
      ...(dcf.wacc == null && wacc != null ? { wacc } : {}),
      details,
    },
  }
}

function resolveSelectedMethodForSynthesis(
  valuationResult: Record<string, any>,
  context?: ExtractValuationResultsContext | null
): string {
  const fromContext = normalizeSelectedMethodKey(context?.selectedValuationMethod)
  if (fromContext) return fromContext

  const rc = getCanonicalReportContext(valuationResult)
  const candidates = [
    rc?.selected_valuation_method,
    valuationResult?.selected_valuation_method,
    valuationResult?.details?.selected_valuation_method,
    valuationResult?.valuation_result?.selected_valuation_method,
  ]
  for (const c of candidates) {
    const normalized = normalizeSelectedMethodKey(c)
    if (normalized) return normalized
  }
  return 'upswitch_adaptive'
}

function resolveExplicitSelectedMethod(
  valuationResult: Record<string, any>,
  context?: ExtractValuationResultsContext | null
): string {
  const fromContext = normalizeSelectedMethodKey(context?.selectedValuationMethod)
  if (fromContext) return fromContext

  const rc = getCanonicalReportContext(valuationResult)
  const candidates = [
    rc?.selected_valuation_method,
    valuationResult?.selected_valuation_method,
    valuationResult?.details?.selected_valuation_method,
    valuationResult?.valuation_result?.selected_valuation_method,
  ]
  for (const c of candidates) {
    const normalized = normalizeSelectedMethodKey(c)
    if (normalized) return normalized
  }
  return ''
}

function hasWeightedSynthesisPayload(valuationResult: Record<string, any>): boolean {
  const candidates = [
    valuationResult,
    valuationResult.weighted_valuation,
    valuationResult.details,
    valuationResult.report_context,
    valuationResult.details?.report_context,
    valuationResult.valuation_result,
    valuationResult.valuation_result?.details,
    valuationResult.valuation_result?.report_context,
    valuationResult.valuation_result?.details?.report_context,
  ]

  return candidates.some((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false
    return candidate.has_weighted_synthesis === true || candidate.blended_equity_value != null
  })
}

function pruneStaleDcfMethod(
  map: Record<string, any>,
  valuationResult: Record<string, any>,
  context?: ExtractValuationResultsContext | null
): Record<string, any> | null {
  if (!map.dcf) return map

  const selectedMethod = resolveExplicitSelectedMethod(valuationResult, context)
  if (!selectedMethod || isDcfMethodKey(selectedMethod) || isHybridMethodKey(selectedMethod)) {
    return map
  }
  if (hasWeightedSynthesisPayload(valuationResult)) {
    return map
  }

  const { dcf: _staleDcf, ...withoutDcf } = map
  return Object.keys(withoutDcf).length > 0 ? withoutDcf : null
}

function getFallbackMethodLabel(methodKey: string): string {
  if (methodKey === 'arr_multiple') {
    return 'ARR multiple'
  }
  if (isRevenueMethodologyKey(methodKey)) {
    return 'Omzetmultiple'
  }
  if (methodKey === 'ebitda_multiple') {
    return 'EBITDA-multiple'
  }
  if (methodKey === 'adjusted_nav') {
    return 'Gecorrigeerde NAV (Intrinsieke Waarde)'
  }
  return methodKey
}

function extractRevenueForMethodEligibility(
  valuationResult: Record<string, any>,
  reportContext: Record<string, any>,
  nested: Record<string, any> | null
): number | null {
  return (
    toFiniteNumber(reportContext.revenue) ??
    toFiniteNumber(reportContext.turnover) ??
    toFiniteNumber(valuationResult.current_year_data?.revenue) ??
    toFiniteNumber(valuationResult.revenue) ??
    toFiniteNumber(valuationResult.turnover) ??
    toFiniteNumber(valuationResult.details?.revenue) ??
    toFiniteNumber(nested?.current_year_data?.revenue) ??
    toFiniteNumber(nested?.revenue) ??
    null
  )
}

function collectExplicitAssetBasedDetails(
  valuationResult: Record<string, any>,
  reportContext: Record<string, any>,
  nested: Record<string, any> | null
): Record<string, unknown> | null {
  const candidates = [
    reportContext,
    valuationResult,
    valuationResult.details,
    nested,
    nested?.details,
    valuationResult.asset_based_details,
    valuationResult.details?.asset_based_details,
    nested?.asset_based_details,
    nested?.details?.asset_based_details,
  ]

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      continue
    }

    const detailsCandidate =
      candidate.asset_based_details &&
      typeof candidate.asset_based_details === 'object' &&
      !Array.isArray(candidate.asset_based_details)
        ? candidate.asset_based_details
        : candidate

    const hasEvidence =
      detailsCandidate.asset_based_evidence === true ||
      Array.isArray(detailsCandidate.asset_adjustments) ||
      toFiniteNumber(detailsCandidate.net_asset_value) != null ||
      toFiniteNumber(detailsCandidate.total_assets_adjusted) != null ||
      toFiniteNumber(detailsCandidate.total_liabilities_adjusted) != null

    if (!hasEvidence) {
      continue
    }

    const assetDetails: Record<string, unknown> = {
      asset_based_evidence: true,
    }

    const explicitFields = [
      'enterprise_value',
      'net_asset_value',
      'net_asset_value_before_deductions',
      'tax_latency_deduction',
      'off_balance_deduction',
      'total_assets_book',
      'total_liabilities_book',
      'total_assets_adjusted',
      'total_liabilities_adjusted',
      'tangible_asset_value',
      'intangible_asset_value',
      'equity_range_low',
      'equity_range_high',
      'methodology',
      'confidence',
      'warnings',
      'asset_adjustments',
      // Audit-trail surfaces (Belgian SME engine)
      'deferred_tax_breakdown',
      'gross_positive_adjustments',
      'effective_tax_latency_pct',
      'sme_eligibility',
      'real_estate_revaluation',
      'equipment_revaluation',
      'deal_structure_comparison',
      'deal_type_selected',
      'manual_nav_adjustments',
    ]

    for (const field of explicitFields) {
      if (detailsCandidate[field] != null) {
        assetDetails[field] = detailsCandidate[field]
      }
    }

    return assetDetails
  }

  return null
}

function synthesizeMinimalValuationResultsMap(
  valuationResult: Record<string, any>,
  context?: ExtractValuationResultsContext | null
): Record<string, any> | null {
  const rc = getCanonicalReportContext(valuationResult)
  const reportContext = rc && typeof rc === 'object' ? (rc as Record<string, any>) : {}
  const vr = valuationResult.valuation_result
  const nested = vr && typeof vr === 'object' ? (vr as Record<string, any>) : null

  const equityMid =
    toFiniteNumber(reportContext.equity_value) ??
    toFiniteNumber(reportContext.equity_value_mid) ??
    toFiniteNumber((valuationResult as any).equity_value_mid) ??
    toFiniteNumber((valuationResult as any).valuation_midpoint) ??
    toFiniteNumber(nested?.equity_value_mid) ??
    null

  const enterpriseMid =
    toFiniteNumber(reportContext.valuation) ??
    toFiniteNumber(reportContext.enterprise_value_mid) ??
    toFiniteNumber((valuationResult as any).enterprise_value_mid) ??
    toFiniteNumber(nested?.enterprise_value_mid) ??
    null

  const multiple =
    toFiniteNumber(reportContext.applied_multiple) ??
    toFiniteNumber((valuationResult as any).multiple) ??
    toFiniteNumber(valuationResult?.ebitda_multiple) ??
    toFiniteNumber(nested?.multiple) ??
    null

  if (equityMid == null && enterpriseMid == null) {
    return null
  }

  const methodKey = resolveSelectedMethodForSynthesis(valuationResult, context)
  const currentRevenue = extractRevenueForMethodEligibility(valuationResult, reportContext, nested)

  const equityLow =
    toFiniteNumber(reportContext.equity_value_low) ??
    toFiniteNumber((valuationResult as any).equity_value_low) ??
    null
  const equityHigh =
    toFiniteNumber(reportContext.equity_value_high) ??
    toFiniteNumber((valuationResult as any).equity_value_high) ??
    null
  const multipleLow = toFiniteNumber(reportContext.multiple_low)
  const multipleHigh = toFiniteNumber(reportContext.multiple_high)

  const details: Record<string, unknown> = {}
  if (equityLow != null) details.equity_range_low = equityLow
  if (equityHigh != null) details.equity_range_high = equityHigh
  if (enterpriseMid != null) details.enterprise_value = enterpriseMid
  if (multipleLow != null) details.p25_multiple = multipleLow
  if (multipleHigh != null) details.p75_multiple = multipleHigh

  if (methodKey === 'adjusted_nav') {
    const assetDetails = collectExplicitAssetBasedDetails(
      valuationResult,
      reportContext,
      nested
    )
    if (!assetDetails) {
      return null
    }
    Object.assign(details, assetDetails)
  }

  if (methodKey === 'dcf') {
    const dcfValuation = getCanonicalDcfValuation(valuationResult)
    const dcfWacc = toFiniteNumber(dcfValuation?.wacc)
    const dcfTerminalValue = toFiniteNumber(dcfValuation?.terminal_value)
    const readiness =
      dcfValuation?.historical_fcf_readiness &&
      typeof dcfValuation.historical_fcf_readiness === 'object' &&
      !Array.isArray(dcfValuation.historical_fcf_readiness)
        ? dcfValuation.historical_fcf_readiness
        : null
    if (dcfWacc != null) details.wacc = dcfWacc
    if (dcfTerminalValue != null) details.terminal_value = dcfTerminalValue
    if (readiness) details.historical_fcf_readiness = readiness
    if (dcfValuation && typeof dcfValuation.mid_year_discounting === 'boolean') {
      details.mid_year_discounting = dcfValuation.mid_year_discounting
    }
    if (
      dcfValuation?.discount_periods_note != null &&
      dcfValuation.discount_periods_note !== ''
    ) {
      details.discount_periods_note = dcfValuation.discount_periods_note
    }
    if (
      dcfValuation?.academic_cost_of_equity_formula != null &&
      dcfValuation.academic_cost_of_equity_formula !== ''
    ) {
      details.academic_cost_of_equity_formula = dcfValuation.academic_cost_of_equity_formula
    }
  }

  const value = equityMid ?? enterpriseMid ?? 0

  if (isRevenueMethodologyKey(methodKey) && currentRevenue != null && currentRevenue <= 0) {
    return {
      [methodKey]: {
        available: false,
        value: null,
        multiple_used: multiple,
        label: getFallbackMethodLabel(methodKey),
        unavailable_reason: 'Omzet moet positief zijn.',
        details,
      },
    }
  }

  const methodEntry = {
    available: true,
    value,
    multiple_used: multiple,
    ...(methodKey === 'dcf' && details.wacc != null ? { wacc: Number(details.wacc) } : {}),
    label: getFallbackMethodLabel(methodKey),
    details,
  }

  if (methodKey === 'upswitch_adaptive') {
    return normalizeAdaptiveMethod({ upswitch_adaptive: methodEntry }, valuationResult)
  }

  return { [methodKey]: methodEntry }
}

/**
 * @param context When the API/report row has `selected_valuation_method` but nested JSON does not,
 * pass it so legacy synthesis picks the correct method key (parity with Titan).
 */
export function extractValuationResultsMap(
  valuationResult: Record<string, any> | null | undefined,
  context?: ExtractValuationResultsContext | null
): Record<string, any> | null {
  if (!valuationResult || typeof valuationResult !== 'object') return null

  const vr = valuationResult.valuation_result
  const nested = vr && typeof vr === 'object' ? (vr as Record<string, any>) : null

  const candidates = [
    valuationResult.valuation_results,
    valuationResult.details?.valuation_results,
    nested?.valuation_results,
    nested?.details?.valuation_results,
    valuationResult.report_context?.valuation_results,
    valuationResult.details?.report_context?.valuation_results,
    nested?.report_context?.valuation_results,
    nested?.details?.report_context?.valuation_results,
  ]

  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate) &&
      Object.keys(candidate).length > 0
    ) {
      const pruned = pruneStaleDcfMethod(
        normalizeAdaptiveMethod(candidate as Record<string, any>, valuationResult),
        valuationResult,
        context
      )
      if (!pruned) {
        continue
      }
      return withMethodAliases(
        enrichDcfMethod(
          pruned,
          valuationResult
        )
      )
    }
  }

  return withMethodAliases(synthesizeMinimalValuationResultsMap(valuationResult, context))
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
  const vr = valuationResult as Record<string, any>
  const selectedValuationMethod =
    options?.selectedValuationMethodOverride ??
    resolveSelectedValuationMethodForExtraction(valuationResult) ??
    vr.selected_valuation_method
  const map = extractValuationResultsMap(vr, {
    selectedValuationMethod: selectedValuationMethod,
  })
  return (map as Record<string, ValuationMethodResult> | null) ?? null
}

function hasNonEmptyValuationResults(value: Record<string, any>): boolean {
  const vr = value.valuation_results
  return !!(vr && typeof vr === 'object' && !Array.isArray(vr) && Object.keys(vr).length > 0)
}

/**
 * Hoists a non-empty method map to top-level `valuation_results` when missing or empty.
 * Fixes legacy session rows where `{}` was stored at the top level but real data lived under
 * `details` / `report_context`. Parity with Titan `normalizeValuationResultWithMethodMap`.
 */
export function normalizeValuationResultWithMethodMap(
  value: Record<string, any> | null,
): Record<string, any> | null {
  if (!value || typeof value !== 'object') return null

  const map = extractValuationResultsMap(value, null)
  if (!map) return value

  if (hasNonEmptyValuationResults(value)) {
    return value
  }

  return { ...value, valuation_results: map }
}
