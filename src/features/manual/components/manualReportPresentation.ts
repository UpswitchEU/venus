import { coalesceFiniteNumber } from '../../../lib/omniPreview'
import type { ValuationMethodResult, ValuationResponse } from '../../../types/valuation'
import {
  getValuationMethodResultForKey,
  hydrateClientValuationResultsMap,
} from '../../../utils/extractValuationResultsMap'

type ManualPresentation = {
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

export function deriveManualReportPresentation(
  result: ValuationResponse | null | undefined,
  selectedMethod?: string | null
): ManualPresentation {
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

  const valuation =
    Number(
      methodData?.value ?? r.equity_value_mid ?? r.valuation_midpoint ?? details.equity_value_mid
    ) || 0
  const valuationLowRaw =
    methodDetails.equity_range_low ??
    r.equity_value_low ??
    r.valuation_min ??
    details.equity_value_low
  const valuationHighRaw =
    methodDetails.equity_range_high ??
    r.equity_value_high ??
    r.valuation_max ??
    details.equity_value_high
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
  selectedMethod?: string | null
): NavVersionPrices {
  const r = asRecord(result)
  const details = asRecord(r.details)
  const presentation = deriveManualReportPresentation(result, selectedMethod)
  const valuationLow = presentation.valuationLow
  const valuationHigh = presentation.valuationHigh
  const valuation = presentation.valuation
  const askingRaw = r.recommended_asking_price ?? details.recommended_asking_price
  const askingFinite =
    askingRaw != null && Number.isFinite(Number(askingRaw)) ? Number(askingRaw) : undefined
  const askPrice = askingFinite ?? valuation
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
