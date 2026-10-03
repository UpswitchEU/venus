import type { YearlyFinancials } from '../types/valuation'
import { FinancialDecimal as Decimal } from './financialDecimal'
import { parseFlexibleNumber } from './isFiniteNumeric'
import { getReportedFinancialEbitda } from './normalizationMath'

/** Amounts whose edits can change earnings, cash flows, or the equity bridge. */
export const FINANCIAL_YEAR_AMOUNT_KEYS = [
  'revenue',
  'ebitda',

  'capex',
  'depreciation',
  'tax_expense',
  'cash',
  'total_debt',
  'lease_liabilities',
  'current_assets',
  'current_liabilities',
  'accounts_receivable',
  'accounts_payable',
  'inventory',
  'short_term_debt',
  'nwc_change',
  'free_cash_flow',
  'total_equity',
  'total_assets',
  'total_liabilities',
  'rent_expense',
  'paid_up_capital',
  'deferred_tax_liabilities',
] as const

/** Legacy blank grid rows contain only revenue/EBITDA zeroes; supporting observations count. */
export function financialYearHasObservations(row: YearlyFinancials): boolean {
  return (
    row.isForecast === true ||
    FINANCIAL_YEAR_AMOUNT_KEYS.some((key) => {
      const value = parseFlexibleNumber(row[key])
      return value !== undefined && (value !== 0 || (key !== 'revenue' && key !== 'ebitda'))
    })
  )
}

export function restoredFiscalYear(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  if (typeof value === 'string' && !/^\d{4}$/.test(value.trim())) return undefined
  const year = Number(value)
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : undefined
}

/** Use imported turnover only when the gross-income reconciliation holds. */
export function turnoverOf(row: unknown): unknown {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return undefined
  const r = row as Record<string, unknown>
  const operating = parseFlexibleNumber(r.operating_revenue)
  if (operating === undefined || operating < 0) return r.revenue
  const gross = parseFlexibleNumber(r.revenue)
  if (gross === undefined) return r.revenue == null ? operating : r.revenue
  const financial = r.financial_income == null ? 0 : parseFlexibleNumber(r.financial_income)
  const extraordinary =
    r.extraordinary_income == null ? 0 : parseFlexibleNumber(r.extraordinary_income)
  if (financial === undefined || extraordinary === undefined) return r.revenue
  // An accounting identity is not a materiality threshold. A percentage tolerance
  // silently erased advisor corrections. Decimal arithmetic avoids binary subtraction noise.
  return new Decimal(gross).minus(financial).minus(extraordinary).eq(operating)
    ? operating
    : r.revenue
}

/** Restore observations and their evidence; absence must never become a zero observation. */
export function restoreFinancialYear(
  value: unknown,
  isForecast = false
): YearlyFinancials | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const row = value as Record<string, unknown>
  const year = restoredFiscalYear(row.year)
  if (year === undefined) return undefined
  const restored: YearlyFinancials = {
    year: String(year),
    revenue: parseFlexibleNumber(turnoverOf(row)),
    ebitda: getReportedFinancialEbitda(row),
  }
  for (const key of FINANCIAL_YEAR_AMOUNT_KEYS) {
    if (key === 'revenue' || key === 'ebitda') continue
    const parsed = parseFlexibleNumber(row[key])
    if (parsed !== undefined) restored[key] = parsed
  }
  for (const key of [
    'source_provider',
    'source_kind',
    'source_digest',
    'correction_id',
    'attestation_id',
    'eligibility_reason',
  ] as const) {
    if (typeof row[key] === 'string') restored[key] = row[key]
  }
  if (typeof row.source_synced_at === 'string' || row.source_synced_at === null) {
    restored.source_synced_at = row.source_synced_at
  }
  if (
    row.quality_state === 'ready' ||
    row.quality_state === 'source_warning' ||
    row.quality_state === 'needs_review' ||
    row.quality_state === 'blocked' ||
    row.quality_state === 'attested_review' ||
    row.quality_state === 'advisor_corrected'
  )
    restored.quality_state = row.quality_state
  if (row._source_reconciled === true) restored._source_reconciled = true
  if (Array.isArray(row.warning_codes)) {
    restored.warning_codes = row.warning_codes.filter(
      (code): code is string => typeof code === 'string' && code.trim().length > 0
    )
  }
  if (isForecast || row.isForecast === true) restored.isForecast = true
  return restored
}
