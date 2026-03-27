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
export type ExtractValuationResultsContext = {
  selectedValuationMethod?: string | null
}

const REVENUE_METHOD_KEYS = new Set(['omzet_multiple', 'revenue_multiple'])

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
  if (details.historical_fcf_readiness == null && readiness) {
    details.historical_fcf_readiness = readiness
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
  const fromContext = context?.selectedValuationMethod?.trim()
  if (fromContext) return fromContext

  const rc = getCanonicalReportContext(valuationResult)
  const candidates = [
    rc?.selected_valuation_method,
    valuationResult?.selected_valuation_method,
    valuationResult?.details?.selected_valuation_method,
    valuationResult?.valuation_result?.selected_valuation_method,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return 'upswitch_adaptive'
}

function getFallbackMethodLabel(methodKey: string): string {
  if (methodKey === 'arr_multiple') {
    return 'ARR multiple'
  }
  if (methodKey === 'omzet_multiple' || methodKey === 'revenue_multiple') {
    return 'Omzetmultiple'
  }
  if (methodKey === 'ebitda_multiple') {
    return 'EBITDA-multiple'
  }
  if (methodKey === 'adjusted_nav') {
    return 'Gecorrigeerde Netto Actiefwaarde (NAV)'
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
  }

  const value = equityMid ?? enterpriseMid ?? 0

  if (REVENUE_METHOD_KEYS.has(methodKey) && currentRevenue != null && currentRevenue <= 0) {
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
      return enrichDcfMethod(
        normalizeAdaptiveMethod(candidate as Record<string, any>, valuationResult),
        valuationResult
      )
    }
  }

  return synthesizeMinimalValuationResultsMap(valuationResult, context)
}
