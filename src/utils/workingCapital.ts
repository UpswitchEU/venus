import type { YearDataInput } from '../types/valuation'
import { FinancialDecimal as Decimal } from './financialDecimal'
import { parseFlexibleNumber } from './isFiniteNumeric'

type WorkingCapitalRow = Partial<YearDataInput> & { isForecast?: boolean }
type FinancialAmount = InstanceType<typeof Decimal>

function tradeBase(year: WorkingCapitalRow): FinancialAmount | null {
  const ar = parseFlexibleNumber(year.accounts_receivable)
  const inventory = parseFlexibleNumber(year.inventory)
  const ap = parseFlexibleNumber(year.accounts_payable)
  if (ar === undefined || inventory === undefined || ap === undefined) return null
  return new Decimal(ar).plus(inventory).minus(ap)
}

function aggregateBase(year: WorkingCapitalRow): FinancialAmount | null {
  const assets = parseFlexibleNumber(year.current_assets)
  const cash = parseFlexibleNumber(year.cash)
  const liabilities = parseFlexibleNumber(year.current_liabilities)
  const debt = parseFlexibleNumber(year.short_term_debt)
  if (assets === undefined || cash === undefined || liabilities === undefined || debt === undefined)
    return null
  return new Decimal(assets).minus(cash).minus(liabilities).plus(debt)
}

function finiteAmount(amount: FinancialAmount | null): number | null {
  if (amount === null) return null
  const number = amount.toNumber()
  return Number.isFinite(number) ? number : null
}

/** Missing balance-sheet components are unknown, including cash and current debt. */
export function calculateWorkingCapitalBase(
  year: WorkingCapitalRow | null | undefined
): number | null {
  if (!year) return null
  return finiteAmount(tradeBase(year) ?? aggregateBase(year))
}

/** Annual reinvestment requires adjacent actual periods and the same complete definition. */
export function calculateWorkingCapitalChange(
  previous: WorkingCapitalRow,
  current: WorkingCapitalRow
): number | null {
  if (
    !Number.isInteger(previous.year) ||
    !Number.isInteger(current.year) ||
    Number(current.year) - Number(previous.year) !== 1 ||
    previous.is_forecast ||
    previous.isForecast ||
    current.is_forecast ||
    current.isForecast
  )
    return null

  for (const base of [tradeBase, aggregateBase]) {
    const before = base(previous)
    const after = base(current)
    if (before !== null && after !== null) return finiteAmount(after.minus(before))
  }
  return null
}

export function deriveNwcChangesForActualYears<T extends YearDataInput>(years: T[]): T[] {
  const sorted = [...years].sort((a, b) => a.year - b.year)
  const counts = new Map<number, number>()
  for (const year of sorted) counts.set(year.year, (counts.get(year.year) ?? 0) + 1)
  return sorted.map((year, index) => {
    // Explicit observations, including zero, always take precedence over derivation.
    if (year.nwc_change !== undefined && year.nwc_change !== null) return year
    const previous = sorted[index - 1]
    if (!previous || counts.get(previous.year) !== 1 || counts.get(year.year) !== 1) return year
    const change = calculateWorkingCapitalChange(previous, year)
    return change === null ? year : { ...year, nwc_change: change }
  })
}
