import type { YearDataInput } from '../types/valuation'
import { toFiniteNumber } from './buildValuationRequest.helpers'
import { readFinancialObservations } from './financialObservations'

type CurrentYearFinancialSource = {
  year?: unknown
  financial_observations?: YearDataInput['financial_observations']
  revenue?: unknown
  ebitda?: unknown
} | null

export interface CurrentYearFinancialBasisInput {
  currentFiscalYear: number
  currentYearData?: CurrentYearFinancialSource
  preferCurrentYearData?: boolean
  topLevelEbitda?: unknown
  topLevelRevenue?: unknown
}

export interface CurrentYearFinancialBasis {
  ebitdaInput: unknown
  reason:
    | 'promoted_current_year'
    | 'stale_top_level_zero'
    | 'top_level_or_fallback'
    | 'evidenced_current_year'
  revenueInput: unknown
  usedCurrentYearData: boolean
}

function currentYearDataMatchesFiscalYear(
  currentYearData: CurrentYearFinancialSource | undefined,
  currentFiscalYear: number
): boolean {
  const year = Number(currentYearData?.year)
  return Number.isFinite(year) && year === currentFiscalYear
}

export function resolveCurrentYearFinancialBasis(
  input: CurrentYearFinancialBasisInput
): CurrentYearFinancialBasis {
  const currentRevenue = toFiniteNumber(input.currentYearData?.revenue)
  const currentEbitda = toFiniteNumber(input.currentYearData?.ebitda)

  const observations = readFinancialObservations(input.currentYearData?.financial_observations)
  if (
    currentYearDataMatchesFiscalYear(input.currentYearData, input.currentFiscalYear) &&
    [observations.revenue, observations.ebitda].some((status) => status && status !== 'unknown')
  ) {
    const valueFor = (field: 'revenue' | 'ebitda', current: number | null, headline: unknown) => {
      const status = observations[field]
      if (status === 'missing' || status === 'placeholder') return null
      if (status === 'observed' || status === 'derived') return current
      return headline ?? current
    }
    return {
      revenueInput: valueFor('revenue', currentRevenue, input.topLevelRevenue),
      ebitdaInput: valueFor('ebitda', currentEbitda, input.topLevelEbitda),
      usedCurrentYearData: true,
      reason: 'evidenced_current_year',
    }
  }

  if (input.preferCurrentYearData && (currentRevenue !== null || currentEbitda !== null)) {
    return {
      revenueInput: currentRevenue ?? input.topLevelRevenue ?? null,
      ebitdaInput: currentEbitda ?? input.topLevelEbitda ?? null,
      usedCurrentYearData: true,
      reason: 'promoted_current_year',
    }
  }

  const topLevelRevenue = toFiniteNumber(input.topLevelRevenue)
  const topLevelEbitda = toFiniteNumber(input.topLevelEbitda)
  const matchesCurrentFiscalYear = currentYearDataMatchesFiscalYear(
    input.currentYearData,
    input.currentFiscalYear
  )
  const currentYearLooksLikeImportedActual = currentRevenue !== null && currentRevenue > 0
  const shouldUseCurrentRevenue =
    matchesCurrentFiscalYear && currentYearLooksLikeImportedActual && topLevelRevenue === 0
  const shouldUseCurrentEbitda =
    matchesCurrentFiscalYear &&
    currentYearLooksLikeImportedActual &&
    topLevelEbitda === 0 &&
    currentEbitda !== null &&
    currentEbitda !== 0

  if (shouldUseCurrentRevenue || shouldUseCurrentEbitda) {
    return {
      revenueInput: shouldUseCurrentRevenue
        ? currentRevenue
        : (input.topLevelRevenue ?? currentRevenue ?? null),
      ebitdaInput: shouldUseCurrentEbitda
        ? currentEbitda
        : (input.topLevelEbitda ?? currentEbitda ?? null),
      usedCurrentYearData: true,
      reason: 'stale_top_level_zero',
    }
  }

  return {
    revenueInput: input.topLevelRevenue ?? currentRevenue ?? null,
    ebitdaInput: input.topLevelEbitda ?? currentEbitda ?? null,
    usedCurrentYearData: false,
    reason: 'top_level_or_fallback',
  }
}

export function currentYearFinancialNumberOrZero(value: unknown): number {
  return toFiniteNumber(value) ?? 0
}
