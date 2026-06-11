import { coalesceFiniteNumber } from '../../../lib/omniPreview'
import { bestBlendedValue, evaluateSynthesisBlend } from '../../../lib/synthesis/synthesisEngine'
import type { ValuationMethodResult, ValuationResponse } from '../../../types/valuation'
import {
  getValuationMethodResultForKey,
  hydrateClientValuationResultsMap,
} from '../../../utils/extractValuationResultsMap'
import { resultHasWeightedSynthesisSignal } from '../utils/weightedSynthesisSignals'

export type ManualReportPresentation = {
  valuation: number
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

function isUsableRow(method: unknown): boolean {
  if (!method || typeof method !== 'object' || Array.isArray(method)) return false
  const m = method as Record<string, unknown>
  if (!m.available) return false
  const v = m.value
  return v != null && Number.isFinite(Number(v))
}

function positiveFiniteNumber(value: unknown): number | null {
  const numeric = coalesceFiniteNumber(value)
  return numeric != null && numeric > 0 ? numeric : null
}

function midpointFromRange(low: unknown, high: unknown): number | null {
  const lowValue = positiveFiniteNumber(low)
  const highValue = positiveFiniteNumber(high)
  if (lowValue == null || highValue == null) return null
  return Math.round((lowValue + highValue) / 2)
}

export type DeriveManualReportPresentationOpts = {
  /** Live client blend (current weights); wins over server-persisted synthesis. */
  clientBlendedValue?: number | null
}

function readSynthesisHeadlineFromResult(r: ManualReportRecord): number | null {
  const weighted = asRecord(r.weighted_valuation)
  const fromWeighted = positiveFiniteNumber(weighted.blended_equity_value)
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
    const value = positiveFiniteNumber(
      candidate.synthesis_blended_value ?? candidate.blended_equity_value
    )
    if (value != null) return value
  }

  return null
}

function readSynthesisRangeFromResult(r: ManualReportRecord): { low?: number; high?: number } {
  const weighted = asRecord(r.weighted_valuation)
  const contributions = Array.isArray(weighted.contributions) ? weighted.contributions : []
  const equityValues = contributions
    .map((row) => coalesceFiniteNumber(asRecord(row).equity_value))
    .filter((value): value is number => value != null)

  if (equityValues.length >= 2) {
    return { low: Math.min(...equityValues), high: Math.max(...equityValues) }
  }

  return {}
}

function resolvePreferredMethodKey(
  valuationResults: Record<string, ValuationMethodResult>,
  requestedMethod?: string | null
): string | null {
  if (requestedMethod) {
    const row = getValuationMethodResultForKey(valuationResults, requestedMethod)
    if (isUsableRow(row)) return requestedMethod
  }

  if (isUsableRow(getValuationMethodResultForKey(valuationResults, 'upswitch_adaptive'))) {
    return 'upswitch_adaptive'
  }

  const firstAvailable = Object.keys(valuationResults).find((k) =>
    isUsableRow(getValuationMethodResultForKey(valuationResults, k))
  )
  return firstAvailable ?? null
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
  return (
    bestBlendedValue(
      evaluateSynthesisBlend({
        result,
        preSelectedMethods: synthesis.preSelectedMethods,
        userWeights: synthesis.userWeights,
      })
    ) != null
  )
}

/** Headline + range using live weights and/or persisted `weighted_valuation`. */
export function resolveSynthesisAwarePresentation(
  result: ValuationResponse | null | undefined,
  selectedMethod: string,
  synthesis: {
    preSelectedMethods: readonly string[]
    userWeights: Record<string, number>
  }
): ManualReportPresentation {
  const blend = bestBlendedValue(
    evaluateSynthesisBlend({
      result,
      preSelectedMethods: synthesis.preSelectedMethods,
      userWeights: synthesis.userWeights,
    })
  )
  return deriveManualReportPresentation(result, selectedMethod, { clientBlendedValue: blend })
}

export function deriveManualReportPresentation(
  result: ValuationResponse | null | undefined,
  selectedMethod?: string | null,
  opts?: DeriveManualReportPresentationOpts
): ManualReportPresentation {
  if (!result) return { valuation: 0 }
  const r = asRecord(result)

  const valuationResult = asRecord(r.valuation_result)
  const details = asRecord(r.details)
  const reportContext =
    asRecordOrNull(r.report_context) ??
    asRecordOrNull(valuationResult.report_context) ??
    asRecordOrNull(details.report_context) ??
    {}
  const hydrated = hydrateClientValuationResultsMap(r) ?? {}
  const hydratedMap = hydrated as Record<string, ValuationMethodResult>
  const methodKey =
    resolvePreferredMethodKey(
      hydratedMap,
      selectedMethod ??
        readString(r, 'selected_valuation_method') ??
        readString(r, 'selectedMethod') ??
        'upswitch_adaptive'
    ) ?? 'upswitch_adaptive'
  const methodData = getValuationMethodResultForKey(hydratedMap, methodKey)
  const methodDetails = asRecord(methodData?.details)
  const multiplesValuation = asRecord(r.multiples_valuation)

  const methodValueRaw =
    methodData?.value ?? r.equity_value_mid ?? r.valuation_midpoint ?? details.equity_value_mid

  const clientBlend =
    opts?.clientBlendedValue != null &&
    Number.isFinite(opts.clientBlendedValue) &&
    opts.clientBlendedValue > 0
      ? opts.clientBlendedValue
      : null
  const serverSynthesis =
    resultHasWeightedSynthesisSignal(r) || clientBlend != null
      ? readSynthesisHeadlineFromResult(r)
      : null
  const synthesisHeadline = clientBlend ?? serverSynthesis
  const synthesisRange = synthesisHeadline != null ? readSynthesisRangeFromResult(r) : {}

  const valuationLowRaw =
    synthesisRange.low ??
    methodDetails.equity_range_low ??
    r.equity_value_low ??
    r.valuation_min ??
    details.equity_value_low
  const valuationHighRaw =
    synthesisRange.high ??
    methodDetails.equity_range_high ??
    r.equity_value_high ??
    r.valuation_max ??
    details.equity_value_high
  const methodValuation =
    positiveFiniteNumber(methodValueRaw) ??
    midpointFromRange(valuationLowRaw, valuationHighRaw) ??
    coalesceFiniteNumber(methodValueRaw) ??
    0
  const valuation = synthesisHeadline ?? methodValuation
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

  return {
    valuation,
    valuationLow:
      valuationLowRaw != null
        ? coalesceFiniteNumber(valuationLowRaw)
        : valuation != null && Number.isFinite(valuation)
          ? Math.round(valuation * 0.8)
          : undefined,
    valuationHigh:
      valuationHighRaw != null
        ? coalesceFiniteNumber(valuationHighRaw)
        : valuation != null && Number.isFinite(valuation)
          ? Math.round(valuation * 1.2)
          : undefined,
    multiple: multipleRaw != null ? coalesceFiniteNumber(multipleRaw) : undefined,
    multipleRange:
      multipleLowRaw != null && multipleHighRaw != null
        ? {
            low: coalesceFiniteNumber(multipleLowRaw),
            high: coalesceFiniteNumber(multipleHighRaw),
          }
        : undefined,
  }
}

/** Price range + ask for CalculatorNav version dropdown — mirrors `valuationSummary` / `setReport` bridge. */
export type NavVersionPrices = {
  priceRange: { min: number; max: number }
  askPrice: number
}

export function deriveNavPricesForVersionNav(
  result: ValuationResponse | null | undefined,
  selectedMethod?: string | null,
  opts?: DeriveManualReportPresentationOpts
): NavVersionPrices {
  const r = asRecord(result)
  const details = asRecord(r.details)
  const presentation = deriveManualReportPresentation(result, selectedMethod, opts)
  const valuationLow = presentation.valuationLow
  const valuationHigh = presentation.valuationHigh
  const valuation = presentation.valuation
  const askingRaw = r.recommended_asking_price ?? details.recommended_asking_price
  const askingFinite =
    askingRaw != null && Number.isFinite(Number(askingRaw)) && Number(askingRaw) > 0
      ? Number(askingRaw)
      : undefined
  const rangeMidpoint = midpointFromRange(valuationLow, valuationHigh)
  const askPrice = askingFinite ?? (valuation > 0 ? valuation : (rangeMidpoint ?? valuation))
  return {
    priceRange: {
      min:
        valuationLow != null && Number.isFinite(valuationLow)
          ? valuationLow
          : Math.round(valuation * 0.85),
      max:
        valuationHigh != null && Number.isFinite(valuationHigh)
          ? valuationHigh
          : Math.round(valuation * 1.15),
    },
    askPrice,
  }
}
