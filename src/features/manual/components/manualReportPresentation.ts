import type { ValuationMethodResult, ValuationResponse } from '../../../types/valuation'
import {
  getValuationMethodResultForKey,
  hydrateClientValuationResultsMap,
} from '../../../utils/extractValuationResultsMap'
import { parseFinancialTransportNumber } from '../../../utils/financialTransport'
import { resultHasWeightedSynthesisSignal } from '../utils/weightedSynthesisSignals'

export type ManualReportPresentation = {
  valuation: number | null
  valueBasis?: 'enterprise_value' | 'equity_value' | null
  valuationLow?: number
  valuationHigh?: number
  multiple?: number
  multipleRange?: { low: number; high: number }
}

type ManualReportRecord = Record<string, unknown>

function asRecord(value: unknown): ManualReportRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as ManualReportRecord)
    : {}
}

function asRecordOrNull(value: unknown): ManualReportRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as ManualReportRecord)
    : null
}

function readString(record: ManualReportRecord, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function positiveFiniteNumber(value: unknown): number | null {
  const numeric = parseFinancialTransportNumber(value)
  return numeric != null && numeric > 0 ? numeric : null
}

export type DeriveManualReportPresentationOpts = {
  /** @deprecated Monetary synthesis is read only from ValuationIQ. */
  clientBlendedValue?: number | null
}

function readSynthesisHeadlineFromResult(r: ManualReportRecord): number | null {
  const weighted = asRecord(r.weighted_valuation)
  const fromWeighted = parseFinancialTransportNumber(weighted.blended_equity_value)
  if (fromWeighted != null) return fromWeighted

  const candidates = [
    r,
    asRecord(r.details),
    asRecord(r.valuation_result),
    asRecord(asRecord(r.valuation_result).details),
    asRecord(r.report_context),
    asRecord(asRecord(r.details).report_context),
  ]

  for (const candidate of candidates) {
    const value = parseFinancialTransportNumber(
      candidate.synthesis_blended_value ?? candidate.blended_equity_value
    )
    if (value != null) return value
  }

  return null
}

function readSynthesisRangeFromResult(r: ManualReportRecord): { low?: number; high?: number } {
  const weighted = asRecord(r.weighted_valuation)
  const low = parseFinancialTransportNumber(weighted.valuation_range_low)
  const high = parseFinancialTransportNumber(weighted.valuation_range_high)
  return low != null && high != null && low <= high ? { low, high } : {}
}

function scopedMethodRange(
  method: ValuationMethodResult | undefined,
  details: ManualReportRecord
): { low: unknown; high: unknown } | null {
  const row = asRecord(method)
  for (const [source, lowKey, highKey] of [
    [
      row,
      row.value_basis === 'enterprise_value' ? 'enterprise_value_low' : 'equity_value_low',
      row.value_basis === 'enterprise_value' ? 'enterprise_value_high' : 'equity_value_high',
    ],
    [row, 'value_low', 'value_high'],
    [
      details,
      row.value_basis === 'enterprise_value' ? 'enterprise_value_low' : 'equity_range_low',
      row.value_basis === 'enterprise_value' ? 'enterprise_value_high' : 'equity_range_high',
    ],
  ] as const) {
    if (lowKey in source || highKey in source) {
      return { low: source[lowKey], high: source[highKey] }
    }
  }
  return null
}

/** True when client-facing headline should follow Waarderingssynthese (not engine adaptive alone). */
export function shouldAlignRecommendedAskingWithSynthesis(
  result: ValuationResponse | null | undefined,
  synthesis: {
    preSelectedMethods: readonly string[]
    userWeights: Record<string, number>
  }
): boolean {
  if (!result) return false
  if (resultHasWeightedSynthesisSignal(result as unknown as Record<string, unknown>)) {
    return true
  }
  return readSynthesisHeadlineFromResult(asRecord(result)) != null
}

/** Headline + range copied from persisted ValuationIQ weighted synthesis. */
export function resolveSynthesisAwarePresentation(
  result: ValuationResponse | null | undefined,
  selectedMethod: string,
  synthesis: {
    preSelectedMethods: readonly string[]
    userWeights: Record<string, number>
  }
): ManualReportPresentation {
  void synthesis
  return deriveManualReportPresentation(result, selectedMethod)
}

export function deriveManualReportPresentation(
  result: ValuationResponse | null | undefined,
  selectedMethod?: string | null,
  opts?: DeriveManualReportPresentationOpts
): ManualReportPresentation {
  if (!result) return { valuation: null }
  void opts
  const r = asRecord(result)

  const valuationResult = asRecord(r.valuation_result)
  const details = asRecord(r.details)
  const reportContext =
    asRecordOrNull(r.report_context) ??
    asRecordOrNull(valuationResult.report_context) ??
    asRecordOrNull(details.report_context) ??
    {}
  const methodKey =
    selectedMethod ??
    readString(r, 'selected_valuation_method') ??
    readString(r, 'selectedMethod') ??
    'upswitch_adaptive'
  const hydrated =
    hydrateClientValuationResultsMap(r, {
      selectedValuationMethodOverride: methodKey,
    }) ?? {}
  const hydratedMap = hydrated as Record<string, ValuationMethodResult>
  const methodData = getValuationMethodResultForKey(hydratedMap, methodKey)
  const methodDetails = asRecord(methodData?.details)
  const multiplesValuation = asRecord(r.multiples_valuation)
  const hasSynthesis = resultHasWeightedSynthesisSignal(r)
  const synthesisHeadline = hasSynthesis ? readSynthesisHeadlineFromResult(r) : null
  const hasMethodInventory = Object.keys(hydratedMap).length > 0
  if (
    (hasSynthesis && synthesisHeadline == null) ||
    (!hasSynthesis && hasMethodInventory && methodData?.available !== true)
  ) {
    return { valuation: null, valueBasis: null }
  }

  // Compatibility for saved reports whose API method card predates the final
  // missing-balance bridge. Read the published report decision, never reprice.
  const usePublishedAdaptive =
    methodKey === 'upswitch_adaptive' &&
    reportContext.is_adaptive_multiples_only === true &&
    reportContext.equity_value_assumed_equal_ev_due_to_missing_balance === true &&
    reportContext.has_weighted_synthesis !== true &&
    !resultHasWeightedSynthesisSignal(r)

  const methodValueRaw =
    (usePublishedAdaptive ? positiveFiniteNumber(reportContext.equity_value) : null) ??
    (hasMethodInventory
      ? methodData?.value
      : (r.equity_value_mid ?? r.valuation_midpoint ?? details.equity_value_mid))
  // Select one economic source for both endpoints. Explicit nulls and partial
  // method bands must not be completed from the overall report's other method.
  const range =
    synthesisHeadline != null
      ? readSynthesisRangeFromResult(r)
      : usePublishedAdaptive
        ? { low: reportContext.equity_value_low, high: reportContext.equity_value_high }
        : (scopedMethodRange(methodData, methodDetails) ?? {
            low: r.equity_value_low ?? r.valuation_min ?? details.equity_value_low,
            high: r.equity_value_high ?? r.valuation_max ?? details.equity_value_high,
          })
  const valuationLowRaw = range.low
  const valuationHighRaw = range.high
  const parsedLow = parseFinancialTransportNumber(valuationLowRaw)
  const parsedHigh = parseFinancialTransportNumber(valuationHighRaw)
  const methodValuation = parseFinancialTransportNumber(methodValueRaw) ?? null
  const valuation = synthesisHeadline ?? methodValuation
  const inconsistentRange =
    parsedLow != null &&
    parsedHigh != null &&
    (parsedLow > parsedHigh ||
      (valuation != null && (valuation < parsedLow || valuation > parsedHigh)))
  const multipleRaw =
    methodData?.multiple_used ??
    valuationResult.multiple ??
    asRecord(reportContext).applied_multiple ??
    multiplesValuation.ebitda_multiple
  const multipleLowRaw =
    methodDetails.p25_multiple ??
    asRecord(valuationResult.multipleRange).low ??
    asRecord(reportContext).multiple_low
  const multipleHighRaw =
    methodDetails.p75_multiple ??
    asRecord(valuationResult.multipleRange).high ??
    asRecord(reportContext).multiple_high
  const multipleLow = parseFinancialTransportNumber(multipleLowRaw)
  const multipleHigh = parseFinancialTransportNumber(multipleHighRaw)

  return {
    valuation,
    valueBasis:
      synthesisHeadline != null
        ? 'equity_value'
        : asRecord(methodData).value_basis === 'enterprise_value'
          ? 'enterprise_value'
          : asRecord(methodData).value_basis === 'equity_value' ||
              methodData?.equity_value != null ||
              r.equity_value_mid != null ||
              r.valuation_midpoint != null ||
              usePublishedAdaptive
            ? 'equity_value'
            : null,
    valuationLow: inconsistentRange ? undefined : parsedLow,
    valuationHigh: inconsistentRange ? undefined : parsedHigh,
    multiple: parseFinancialTransportNumber(multipleRaw),
    multipleRange:
      multipleLow != null && multipleHigh != null && multipleLow <= multipleHigh
        ? { low: multipleLow, high: multipleHigh }
        : undefined,
  }
}

/** Price range + ask for CalculatorNav version dropdown — mirrors `valuationSummary` / `setReport` bridge. */
export type NavVersionPrices = {
  priceRange?: { min: number; max: number }
  askPrice?: number
}

export function deriveNavPricesForVersionNav(
  result: ValuationResponse | null | undefined,
  selectedMethod?: string | null,
  opts?: DeriveManualReportPresentationOpts
): NavVersionPrices | null {
  const r = asRecord(result)
  const details = asRecord(r.details)
  const presentation = deriveManualReportPresentation(result, selectedMethod, opts)
  const valuationLow = presentation.valuationLow
  const valuationHigh = presentation.valuationHigh
  const valuation = presentation.valuation
  if (valuation == null || presentation.valueBasis === 'enterprise_value') return null
  const context = asRecord(r.report_context ?? details.report_context)
  const publishedAsking =
    (!selectedMethod || selectedMethod === 'upswitch_adaptive') &&
    (context.recommended_asking_price_buffer_suppressed === true ||
      context.recommended_asking_price_realigned === true)
      ? parseFinancialTransportNumber(context.recommended_asking_price)
      : null
  const askingRaw =
    publishedAsking ?? r.recommended_asking_price ?? details.recommended_asking_price
  const askingFinite = parseFinancialTransportNumber(askingRaw)
  const askPrice = askingFinite != null && askingFinite >= 0 ? askingFinite : undefined
  return {
    priceRange:
      valuationLow != null &&
      valuationHigh != null &&
      valuationLow <= valuation &&
      valuation <= valuationHigh
        ? { min: valuationLow, max: valuationHigh }
        : undefined,
    askPrice,
  }
}
