import type { SubmittedFinancialSnapshot, SubmittedFinancialYear } from './manualFinancialSnapshot'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function readNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function rowHasFinancials(row: Record<string, unknown>): boolean {
  return readNumber(row.revenue) > 0 || readNumber(row.ebitda) !== 0
}

function forecastRowHasFinancials(row: Record<string, unknown>): boolean {
  return rowHasFinancials(row) || row.capex != null || row.nwc_change != null
}

function toSubmittedYear(row: Record<string, unknown>, isForecast = false): SubmittedFinancialYear {
  return {
    year: String(row.year),
    revenue: readNumber(row.revenue),
    ebitda: readNumber(row.ebitda),
    capex: readOptionalNumber(row.capex),
    nwc_change: readOptionalNumber(row.nwc_change),
    ...(isForecast ? { isForecast: true } : {}),
  }
}

export function buildManualRestoredFinancialSnapshot(
  formData: unknown
): SubmittedFinancialSnapshot | null {
  const formRecord = asRecord(formData)
  if (!formRecord) return null

  const currentYearData = asRecord(formRecord.current_year_data)
  const historicalRows = Array.isArray(formRecord.historical_years_data)
    ? formRecord.historical_years_data
        .map(asRecord)
        .filter((row): row is Record<string, unknown> => Boolean(row))
    : []
  const forecastRows = Array.isArray(formRecord.forecast_years_data)
    ? formRecord.forecast_years_data
        .map(asRecord)
        .filter((row): row is Record<string, unknown> => Boolean(row))
    : []

  const hasFinancials =
    (currentYearData ? rowHasFinancials(currentYearData) : false) ||
    historicalRows.some(rowHasFinancials) ||
    forecastRows.some(forecastRowHasFinancials)

  if (!hasFinancials) return null

  const yearlyFinancials = [
    ...(currentYearData ? [toSubmittedYear(currentYearData)] : []),
    ...historicalRows.map((row) => toSubmittedYear(row)),
    ...forecastRows.map((row) => toSubmittedYear(row, true)),
  ].sort((a, b) => Number.parseInt(b.year, 10) - Number.parseInt(a.year, 10))

  return {
    revenue:
      currentYearData && 'revenue' in currentYearData
        ? readNumber(currentYearData.revenue)
        : readOptionalNumber(formRecord.revenue),
    ebitda:
      currentYearData && 'ebitda' in currentYearData
        ? readNumber(currentYearData.ebitda)
        : readOptionalNumber(formRecord.ebitda),
    yearlyFinancials,
  }
}
