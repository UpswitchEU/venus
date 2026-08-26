import { parseFlexibleNumber } from './isFiniteNumeric'

export const REQUIRED_DCF_ACTUAL_YEARS = 3

export interface DcfReadinessYearLike {
  year?: string | number | null
  revenue?: unknown
  ebitda?: unknown
  free_cash_flow?: unknown
  isForecast?: boolean
  is_forecast?: boolean
}

export interface ManualDcfReadinessInput {
  yearlyFinancials?: ReadonlyArray<DcfReadinessYearLike> | null
  currentYearData?: DcfReadinessYearLike | null
  historicalYearsData?: ReadonlyArray<DcfReadinessYearLike> | null
  forecastYearsData?: ReadonlyArray<DcfReadinessYearLike> | null
  dcfInputMode?: string | null
}

export interface ManualDcfReadiness {
  admittedActualYears: number[]
  explicitFcffProjectionYears: number[]
  missingActualYears: number
  ready: boolean
}

export interface ExplicitDcfIntentInput {
  selectedMethod?: string | null
  selectedMethods?: ReadonlyArray<string> | null
  userConfiguredDcf?: boolean | null
  dcfInputMode?: string | null
  exitMultiple?: unknown
  discountingConvention?: string | null
  taxShieldProjectionCount?: number | null
  userWeights?: Record<string, number> | null
  methodology?: string | null
}

function isForecast(row: DcfReadinessYearLike): boolean {
  return Boolean(row.isForecast || row.is_forecast)
}

function integerYear(value: unknown): number | null {
  const year = Number(value)
  return Number.isInteger(year) ? year : null
}

function isCompleteBasisRow(row: DcfReadinessYearLike): boolean {
  const revenue = parseFlexibleNumber(row.revenue)
  const ebitda = parseFlexibleNumber(row.ebitda)
  if (revenue != null && ebitda != null && (revenue !== 0 || ebitda !== 0)) return true

  const freeCashFlow = parseFlexibleNumber(row.free_cash_flow)
  return freeCashFlow != null && freeCashFlow !== 0
}

function hasPositiveDcfWeight(weights?: Record<string, number> | null): boolean {
  return Object.entries(weights ?? {}).some(([method, rawWeight]) => {
    const weight = Number(rawWeight)
    return method.toLowerCase().includes('dcf') && Number.isFinite(weight) && weight > 0
  })
}

/**
 * Durable DCF intent. `use_dcf` is deliberately absent: it is a legacy
 * capability switch and must never turn Adaptive into an explicit DCF choice.
 */
export function explicitlyRequestsDcf(input: ExplicitDcfIntentInput): boolean {
  const selectedMethod = String(input.selectedMethod ?? '')
    .trim()
    .toLowerCase()
  const selectedMethods = input.selectedMethods ?? []

  return Boolean(
    selectedMethod === 'dcf' ||
      selectedMethods.some((method) => String(method).trim().toLowerCase() === 'dcf') ||
      input.userConfiguredDcf ||
      input.dcfInputMode === 'fcff_only' ||
      parseFlexibleNumber(input.exitMultiple) != null ||
      input.discountingConvention === 'year_end' ||
      Number(input.taxShieldProjectionCount) > 0 ||
      hasPositiveDcfWeight(input.userWeights) ||
      String(input.methodology ?? '')
        .trim()
        .toUpperCase() === 'DCF'
  )
}

/**
 * Browser-side mirror of Titan/ValuationIQ admission. The live manual rows are
 * canonical while the user edits; request-shaped current/history arrays are a
 * fallback for restored sessions and tests.
 */
export function resolveManualDcfReadiness(input: ManualDcfReadinessInput): ManualDcfReadiness {
  const liveRows = input.yearlyFinancials ?? []
  const usesLiveRows = liveRows.length > 0
  const actualRows: DcfReadinessYearLike[] = []
  const forecastRows: DcfReadinessYearLike[] = []

  if (usesLiveRows) {
    for (const row of liveRows) {
      if (isForecast(row)) forecastRows.push(row)
      else actualRows.push(row)
    }
  } else {
    if (input.currentYearData) actualRows.push(input.currentYearData)
    actualRows.push(...(input.historicalYearsData ?? []))
    forecastRows.push(...(input.forecastYearsData ?? []))
  }

  // For live rows, the request mapper promotes the most recent complete actual
  // row to current_year_data. A trailing 0/0 placeholder must not move that
  // basis forward and accidentally invalidate a legitimate next-year forecast.
  const basisYear = usesLiveRows
    ? actualRows.reduce((latest, row) => {
        const year = integerYear(row.year)
        return year == null || !isCompleteBasisRow(row) ? latest : Math.max(latest, year)
      }, 0)
    : (integerYear(input.currentYearData?.year) ?? 0)

  const admittedActualYears = new Set<number>()
  for (const row of actualRows) {
    const year = integerYear(row.year)
    const revenue = parseFlexibleNumber(row.revenue)
    const ebitda = parseFlexibleNumber(row.ebitda)
    if (year == null || isForecast(row) || revenue == null || revenue <= 0 || ebitda == null) {
      continue
    }
    if (basisYear > 0 && year > basisYear) continue
    if (!usesLiveRows && row !== input.currentYearData && basisYear > 0 && year >= basisYear) {
      continue
    }
    admittedActualYears.add(year)
  }

  const explicitFcffProjectionYears = new Set<number>()
  if (input.dcfInputMode === 'fcff_only') {
    for (const row of forecastRows) {
      const year = integerYear(row.year)
      const freeCashFlow = parseFlexibleNumber(row.free_cash_flow)
      if (year != null && year > basisYear && freeCashFlow != null) {
        explicitFcffProjectionYears.add(year)
      }
    }
  }

  const admitted = [...admittedActualYears].sort((left, right) => left - right)
  const projections = [...explicitFcffProjectionYears].sort((left, right) => left - right)
  const missingActualYears = Math.max(0, REQUIRED_DCF_ACTUAL_YEARS - admitted.length)

  return {
    admittedActualYears: admitted,
    explicitFcffProjectionYears: projections,
    missingActualYears,
    ready: admitted.length >= REQUIRED_DCF_ACTUAL_YEARS || projections.length > 0,
  }
}
