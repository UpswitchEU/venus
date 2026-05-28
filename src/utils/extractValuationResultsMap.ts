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

type UnknownRecord = Record<string, unknown>
type MethodResultRow = ValuationMethodResult & UnknownRecord
type MethodResultMap = Record<string, MethodResultRow>

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

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null
}

function nestedRecord(value: UnknownRecord | null | undefined, key: string): UnknownRecord | null {
  return value ? asRecord(value[key]) : null
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

function withMethodAliases(map: MethodResultMap | null): MethodResultMap | null {
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

function toFiniteNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const normalized = value.map(toFiniteNumber)
  return normalized.every((v): v is number => v != null) ? normalized : null
}

function enrichDcfDetailsFromValuation(
  details: Record<string, unknown>,
  dcfValuation: UnknownRecord
): Record<string, unknown> {
  const numericFields = [
    'enterprise_value',
    'wacc',
    'terminal_value',
    'terminal_value_pct_of_total',
    'explicit_forecast_pct_of_total',
    'dcf_enterprise_value_before_apv',
    'dcf_equity_value_before_apv',
    'apv_discount_rate',
    'apv_tax_shield_value',
    'apv_tax_shield_pct_of_total',
    'apv_enterprise_value',
    'apv_equity_value',
  ]

  for (const field of numericFields) {
    const value = toFiniteNumber(dcfValuation[field])
    if (details[field] == null && value != null) {
      details[field] = value
    }
  }

  const textFields = [
    'discount_periods_note',
    'academic_cost_of_equity_formula',
    'apv_methodology',
    'apv_discounting_convention',
  ]
  for (const field of textFields) {
    const value = dcfValuation[field]
    if (details[field] == null && typeof value === 'string' && value.trim() !== '') {
      details[field] = value
    }
  }

  const midYear = dcfValuation.mid_year_discounting
  if (details.mid_year_discounting == null && typeof midYear === 'boolean') {
    details.mid_year_discounting = midYear
  }

  if (
    details.wacc_buildup == null &&
    dcfValuation.wacc_buildup &&
    typeof dcfValuation.wacc_buildup === 'object'
  ) {
    details.wacc_buildup = dcfValuation.wacc_buildup
  }

  const readiness = asRecord(dcfValuation.historical_fcf_readiness)
  if (details.historical_fcf_readiness == null && readiness) {
    details.historical_fcf_readiness = readiness
  }

  const apvBridgeProvenance = asRecord(dcfValuation.apv_bridge_provenance)
  if (details.apv_bridge_provenance == null && apvBridgeProvenance) {
    details.apv_bridge_provenance = apvBridgeProvenance
  }

  const apvBenchmarkReconciliation = asRecord(dcfValuation.apv_benchmark_reconciliation)
  if (details.apv_benchmark_reconciliation == null && apvBenchmarkReconciliation) {
    details.apv_benchmark_reconciliation = apvBenchmarkReconciliation
  }

  const projectionFields = ['apv_tax_shield_projections_5y', 'apv_tax_shield_pv_5y']
  for (const field of projectionFields) {
    const values = toFiniteNumberArray(dcfValuation[field])
    if (details[field] == null && values) {
      details[field] = values
    }
  }

  return details
}

function getCanonicalReportContext(valuationResult: UnknownRecord): UnknownRecord | null {
  const nested = nestedRecord(valuationResult, 'valuation_result')
  const details = nestedRecord(valuationResult, 'details')
  const nestedDetails = nestedRecord(nested, 'details')
  const candidates = [
    valuationResult.report_context,
    details?.report_context,
    nested?.report_context,
    nestedDetails?.report_context,
  ]

  for (const candidate of candidates) {
    const record = asRecord(candidate)
    if (record) {
      return record
    }
  }
  return null
}

function getCanonicalDcfValuation(valuationResult: UnknownRecord): UnknownRecord | null {
  const nested = nestedRecord(valuationResult, 'valuation_result')
  const details = nestedRecord(valuationResult, 'details')
  const nestedDetails = nestedRecord(nested, 'details')
  const reportContext = nestedRecord(valuationResult, 'report_context')
  const detailsReportContext = nestedRecord(details, 'report_context')
  const nestedReportContext = nestedRecord(nested, 'report_context')
  const nestedDetailsReportContext = nestedRecord(nestedDetails, 'report_context')
  const candidates = [
    valuationResult.dcf_valuation,
    details?.dcf_valuation,
    nested?.dcf_valuation,
    nestedDetails?.dcf_valuation,
    reportContext?.dcf_valuation,
    detailsReportContext?.dcf_valuation,
    nestedReportContext?.dcf_valuation,
    nestedDetailsReportContext?.dcf_valuation,
  ]

  for (const candidate of candidates) {
    const record = asRecord(candidate)
    if (record) {
      return record
    }
  }

  return null
}

function normalizeAdaptiveMethod(
  map: MethodResultMap,
  valuationResult: UnknownRecord
): MethodResultMap {
  const adaptive = map.upswitch_adaptive
  if (!adaptive || typeof adaptive !== 'object') return map

  const reportContext = getCanonicalReportContext(valuationResult)
  const nested = nestedRecord(valuationResult, 'valuation_result')
  const canonicalMultiple =
    toFiniteNumber(reportContext?.applied_multiple) ??
    toFiniteNumber(nested?.multiple) ??
    toFiniteNumber(valuationResult.multiple) ??
    null
  const multipleLow = toFiniteNumber(reportContext?.multiple_low)
  const multipleHigh = toFiniteNumber(reportContext?.multiple_high)
  const adaptiveDetails = asRecord(adaptive.details)
  const details = adaptiveDetails ? { ...adaptiveDetails } : {}

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

function enrichDcfMethod(map: MethodResultMap, valuationResult: UnknownRecord): MethodResultMap {
  const dcf = map.dcf
  if (!dcf || typeof dcf !== 'object' || Array.isArray(dcf)) return map

  const dcfValuation = getCanonicalDcfValuation(valuationResult)
  if (!dcfValuation) return map

  const dcfDetails = asRecord(dcf.details)
  const details = dcfDetails ? { ...dcfDetails } : {}

  const wacc = toFiniteNumber(dcfValuation.wacc)
  enrichDcfDetailsFromValuation(details, dcfValuation)

  const apvEquityValue = toFiniteNumber(dcfValuation.apv_equity_value)
  const equityValue = toFiniteNumber(dcfValuation.equity_value)

  return {
    ...map,
    dcf: {
      ...dcf,
      ...((apvEquityValue ?? equityValue) != null ? { value: apvEquityValue ?? equityValue } : {}),
      ...(dcf.wacc == null && wacc != null ? { wacc } : {}),
      details,
    },
  }
}

function resolveSelectedMethodForSynthesis(
  valuationResult: UnknownRecord,
  context?: ExtractValuationResultsContext | null
): string {
  const fromContext = normalizeSelectedMethodKey(context?.selectedValuationMethod)
  if (fromContext) return fromContext

  const rc = getCanonicalReportContext(valuationResult)
  const details = nestedRecord(valuationResult, 'details')
  const nested = nestedRecord(valuationResult, 'valuation_result')
  const candidates = [
    rc?.selected_valuation_method,
    valuationResult?.selected_valuation_method,
    details?.selected_valuation_method,
    nested?.selected_valuation_method,
  ]
  for (const c of candidates) {
    const normalized = normalizeSelectedMethodKey(c)
    if (normalized) return normalized
  }
  return 'upswitch_adaptive'
}

function resolveExplicitSelectedMethod(
  valuationResult: UnknownRecord,
  context?: ExtractValuationResultsContext | null
): string {
  const fromContext = normalizeSelectedMethodKey(context?.selectedValuationMethod)
  if (fromContext) return fromContext

  const rc = getCanonicalReportContext(valuationResult)
  const details = nestedRecord(valuationResult, 'details')
  const nested = nestedRecord(valuationResult, 'valuation_result')
  const candidates = [
    rc?.selected_valuation_method,
    valuationResult?.selected_valuation_method,
    details?.selected_valuation_method,
    nested?.selected_valuation_method,
  ]
  for (const c of candidates) {
    const normalized = normalizeSelectedMethodKey(c)
    if (normalized) return normalized
  }
  return ''
}

function hasWeightedSynthesisPayload(valuationResult: UnknownRecord): boolean {
  const details = nestedRecord(valuationResult, 'details')
  const reportContext = nestedRecord(valuationResult, 'report_context')
  const detailsReportContext = nestedRecord(details, 'report_context')
  const nested = nestedRecord(valuationResult, 'valuation_result')
  const nestedDetails = nestedRecord(nested, 'details')
  const nestedReportContext = nestedRecord(nested, 'report_context')
  const nestedDetailsReportContext = nestedRecord(nestedDetails, 'report_context')
  const candidates = [
    valuationResult,
    valuationResult.weighted_valuation,
    details,
    reportContext,
    detailsReportContext,
    nested,
    nestedDetails,
    nestedReportContext,
    nestedDetailsReportContext,
  ]

  return candidates.some((candidate) => {
    const record = asRecord(candidate)
    if (!record) return false
    return (
      record.has_weighted_synthesis === true ||
      record.synthesis_blended_value != null ||
      record.blended_equity_value != null
    )
  })
}

function pruneStaleDcfMethod(
  map: MethodResultMap,
  valuationResult: UnknownRecord,
  context?: ExtractValuationResultsContext | null
): MethodResultMap | null {
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
  valuationResult: UnknownRecord,
  reportContext: UnknownRecord,
  nested: UnknownRecord | null
): number | null {
  const currentYearData = nestedRecord(valuationResult, 'current_year_data')
  const details = nestedRecord(valuationResult, 'details')
  const nestedCurrentYearData = nestedRecord(nested, 'current_year_data')
  return (
    toFiniteNumber(reportContext.revenue) ??
    toFiniteNumber(reportContext.turnover) ??
    toFiniteNumber(currentYearData?.revenue) ??
    toFiniteNumber(valuationResult.revenue) ??
    toFiniteNumber(valuationResult.turnover) ??
    toFiniteNumber(details?.revenue) ??
    toFiniteNumber(nestedCurrentYearData?.revenue) ??
    toFiniteNumber(nested?.revenue) ??
    null
  )
}

function collectExplicitAssetBasedDetails(
  valuationResult: UnknownRecord,
  reportContext: UnknownRecord,
  nested: UnknownRecord | null
): Record<string, unknown> | null {
  const details = nestedRecord(valuationResult, 'details')
  const nestedDetails = nestedRecord(nested, 'details')
  const candidates = [
    reportContext,
    valuationResult,
    details,
    nested,
    nestedDetails,
    valuationResult.asset_based_details,
    details?.asset_based_details,
    nested?.asset_based_details,
    nestedDetails?.asset_based_details,
  ]

  for (const candidate of candidates) {
    const candidateRecord = asRecord(candidate)
    if (!candidateRecord) {
      continue
    }

    const detailsCandidate = asRecord(candidateRecord.asset_based_details) ?? candidateRecord

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
  valuationResult: UnknownRecord,
  context?: ExtractValuationResultsContext | null
): MethodResultMap | null {
  const rc = getCanonicalReportContext(valuationResult)
  const reportContext = rc ?? {}
  const nested = nestedRecord(valuationResult, 'valuation_result')

  const equityMid =
    toFiniteNumber(reportContext.equity_value) ??
    toFiniteNumber(reportContext.equity_value_mid) ??
    toFiniteNumber(valuationResult.equity_value_mid) ??
    toFiniteNumber(valuationResult.valuation_midpoint) ??
    toFiniteNumber(nested?.equity_value_mid) ??
    null

  const enterpriseMid =
    toFiniteNumber(reportContext.valuation) ??
    toFiniteNumber(reportContext.enterprise_value_mid) ??
    toFiniteNumber(valuationResult.enterprise_value_mid) ??
    toFiniteNumber(nested?.enterprise_value_mid) ??
    null

  const multiple =
    toFiniteNumber(reportContext.applied_multiple) ??
    toFiniteNumber(valuationResult.multiple) ??
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
    toFiniteNumber(valuationResult.equity_value_low) ??
    null
  const equityHigh =
    toFiniteNumber(reportContext.equity_value_high) ??
    toFiniteNumber(valuationResult.equity_value_high) ??
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
    const assetDetails = collectExplicitAssetBasedDetails(valuationResult, reportContext, nested)
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
    if (dcfValuation) {
      enrichDcfDetailsFromValuation(details, dcfValuation)
    }
    if (dcfValuation && typeof dcfValuation.mid_year_discounting === 'boolean') {
      details.mid_year_discounting = dcfValuation.mid_year_discounting
    }
    if (dcfValuation?.discount_periods_note != null && dcfValuation.discount_periods_note !== '') {
      details.discount_periods_note = dcfValuation.discount_periods_note
    }
    if (
      dcfValuation?.academic_cost_of_equity_formula != null &&
      dcfValuation.academic_cost_of_equity_formula !== ''
    ) {
      details.academic_cost_of_equity_formula = dcfValuation.academic_cost_of_equity_formula
    }
  }

  const dcfValuation = methodKey === 'dcf' ? getCanonicalDcfValuation(valuationResult) : null
  const value =
    methodKey === 'dcf'
      ? (toFiniteNumber(dcfValuation?.apv_equity_value) ??
        toFiniteNumber(dcfValuation?.equity_value) ??
        equityMid ??
        enterpriseMid ??
        0)
      : (equityMid ?? enterpriseMid ?? 0)

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

  const methodEntry: MethodResultRow = {
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
      return withMethodAliases(enrichDcfMethod(pruned, valuationResult))
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

  const withMap = hasNonEmptyValuationResults(value)
    ? value
    : { ...value, valuation_results: map }

  return normalizeValuationResultEnvelope(withMap as unknown as ValuationResponse) as unknown as UnknownRecord
}
