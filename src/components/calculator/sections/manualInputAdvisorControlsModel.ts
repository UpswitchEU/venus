import type { ManualValuationFormData } from '../../../types/valuation'
import { parseFlexibleNumber } from '../../../utils/isFiniteNumeric'
import { isYearRowForecast } from '../../../utils/yearData'
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

function hasPositiveRevenue(row: { revenue?: unknown } | null | undefined): boolean {
  return toPositiveNumber(row?.revenue) != null
}

export function deriveAdvisorWeightingYears({
  formData,
  historicalCardRows,
}: {
  formData: ManualValuationFormData
  historicalCardRows: Array<{ year: string | number; revenue?: unknown }>
}): number[] {
  const years = new Set<number>()
  const currentYear = Number(formData.current_year_data?.year ?? historicalCardRows[0]?.year)
  const currentYearSource =
    formData.current_year_data ??
    historicalCardRows.find((row) => Number(row.year) === currentYear) ??
    null

  if (Number.isFinite(currentYear) && hasPositiveRevenue(currentYearSource)) {
    years.add(currentYear)
  }

  for (const yearData of formData.historical_years_data ?? []) {
    const year = Number(yearData.year)
    if (!isYearRowForecast(yearData) && Number.isFinite(year) && hasPositiveRevenue(yearData)) {
      years.add(year)
    }
  }

  return Array.from(years).sort((a, b) => a - b)
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
  historicalCardRows: Array<{ year: string | number; revenue?: unknown }>
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
