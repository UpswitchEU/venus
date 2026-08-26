import type { ManualValuationFormData } from '../../../types/valuation'
import { resolveManualDcfReadiness } from '../../../utils/dcfReadiness'
import { parseFlexibleNumber } from '../../../utils/isFiniteNumeric'
import type { ManualInputNormalizedData } from '../utils/manualInputNormalizedData'

export interface ManualInputAdvisorControlsModel {
  advisorControlsPreviewEbitda: number | null
  advisorWeightingYears: number[]
  sectorAverageMultiple: number | null
}

function toPositiveNumber(value: unknown): number | null {
  const parsed = parseFlexibleNumber(value)
  return parsed !== undefined && parsed > 0 ? parsed : null
}

export function deriveAdvisorWeightingYears({
  formData,
  historicalCardRows,
}: {
  formData: ManualValuationFormData
  historicalCardRows: Array<{
    year: string | number
    revenue?: unknown
    ebitda?: unknown
    isForecast?: boolean
    is_forecast?: boolean
  }>
}): number[] {
  const hasRequestShapedRows = Boolean(
    formData.current_year_data ||
      formData.historical_years_data?.length ||
      formData.forecast_years_data?.length
  )
  const liveRows = formData.yearlyFinancials?.length
    ? formData.yearlyFinancials
    : !hasRequestShapedRows && historicalCardRows.length
      ? historicalCardRows
      : undefined
  return resolveManualDcfReadiness({
    yearlyFinancials: liveRows,
    currentYearData: formData.current_year_data,
    historicalYearsData: formData.historical_years_data,
    forecastYearsData: formData.forecast_years_data,
    dcfInputMode: formData.dcf_input_mode,
  }).admittedActualYears
}

export function resolveAdvisorSectorAverageMultiple(businessContext: unknown): number | null {
  const context =
    businessContext && typeof businessContext === 'object'
      ? (businessContext as Record<string, unknown>)
      : null
  const distribution =
    context?.ev_ebitda_multiple && typeof context.ev_ebitda_multiple === 'object'
      ? (context.ev_ebitda_multiple as Record<string, unknown>)
      : null

  const candidates = [
    context?.benchmark_multiple,
    context?.ev_ebitda_median,
    distribution?.median,
    distribution?.p50,
  ]

  for (const candidate of candidates) {
    const value = toPositiveNumber(candidate)
    if (value != null) return value
  }

  return null
}

export function resolveAdvisorControlsPreviewEbitda({
  formData,
  normalizedData,
}: {
  formData: ManualValuationFormData
  normalizedData: ManualInputNormalizedData
}): number | null {
  const candidates = [
    normalizedData.totalYearsWithData > 0 ? normalizedData.averageNormalizedEbitda : undefined,
    formData.current_year_data?.ebitda,
    formData.ebitda,
  ]

  for (const candidate of candidates) {
    const value = toPositiveNumber(candidate)
    if (value != null) return value
  }

  return null
}

export function buildManualInputAdvisorControlsModel({
  formData,
  historicalCardRows,
  normalizedData,
}: {
  formData: ManualValuationFormData
  historicalCardRows: Array<{
    year: string | number
    revenue?: unknown
    ebitda?: unknown
    isForecast?: boolean
    is_forecast?: boolean
  }>
  normalizedData: ManualInputNormalizedData
}): ManualInputAdvisorControlsModel {
  return {
    advisorControlsPreviewEbitda: resolveAdvisorControlsPreviewEbitda({
      formData,
      normalizedData,
    }),
    advisorWeightingYears: deriveAdvisorWeightingYears({ formData, historicalCardRows }),
    sectorAverageMultiple: resolveAdvisorSectorAverageMultiple(formData.business_context),
  }
}
