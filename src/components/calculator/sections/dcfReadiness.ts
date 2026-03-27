import type { YearDataInput } from '../../../types/valuation'
import { calculateWorkingCapitalBase } from '../../../utils/yearData'

export interface DcfReadinessInsight {
  status: 'imported_ready' | 'partial' | 'manual_fallback'
  actualYearsCount: number
  actualCapexYears: number
  actualTaxYears: number
  actualWorkingCapitalYears: number
  derivedWorkingCapitalYears: number
  missingSignals: Array<'capex' | 'taxes' | 'working_capital'>
}

function hasFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function deriveDcfReadinessInsight(args: {
  currentYearData?: YearDataInput | null
  historicalYearsData?: YearDataInput[] | null
}): DcfReadinessInsight {
  const actualYears = [
    ...(args.historicalYearsData ?? []).filter((year) => !year.is_forecast),
    ...(args.currentYearData ? [args.currentYearData] : []),
  ]
    .filter((year) => typeof year.year === 'number' && Number.isFinite(year.year))
    .sort((a, b) => a.year - b.year)

  if (actualYears.length === 0) {
    return {
      status: 'manual_fallback',
      actualYearsCount: 0,
      actualCapexYears: 0,
      actualTaxYears: 0,
      actualWorkingCapitalYears: 0,
      derivedWorkingCapitalYears: 0,
      missingSignals: ['capex', 'taxes', 'working_capital'],
    }
  }

  const actualCapexYears = actualYears.filter((year) => hasFinite(year.capex)).length
  const actualTaxYears = actualYears.filter((year) => hasFinite(year.tax_expense)).length

  let actualWorkingCapitalYears = 0
  let derivedWorkingCapitalYears = 0
  for (let index = 0; index < actualYears.length; index++) {
    const year = actualYears[index]
    if (hasFinite(year.nwc_change)) {
      actualWorkingCapitalYears++
      continue
    }

    if (index === 0) {
      continue
    }

    const currentBase = calculateWorkingCapitalBase(year)
    const previousBase = calculateWorkingCapitalBase(actualYears[index - 1])
    if (currentBase !== null && previousBase !== null) {
      derivedWorkingCapitalYears++
    }
  }

  const missingSignals: DcfReadinessInsight['missingSignals'] = []
  if (actualCapexYears < actualYears.length) {
    missingSignals.push('capex')
  }
  if (actualTaxYears < actualYears.length) {
    missingSignals.push('taxes')
  }
  if (actualWorkingCapitalYears + derivedWorkingCapitalYears < Math.max(0, actualYears.length - 1)) {
    missingSignals.push('working_capital')
  }

  const hasAnyImportedSignal =
    actualCapexYears > 0 ||
    actualTaxYears > 0 ||
    actualWorkingCapitalYears > 0 ||
    derivedWorkingCapitalYears > 0

  const status =
    actualYears.length >= 2 && missingSignals.length === 0
      ? 'imported_ready'
      : hasAnyImportedSignal
        ? 'partial'
        : 'manual_fallback'

  return {
    status,
    actualYearsCount: actualYears.length,
    actualCapexYears,
    actualTaxYears,
    actualWorkingCapitalYears,
    derivedWorkingCapitalYears,
    missingSignals,
  }
}
