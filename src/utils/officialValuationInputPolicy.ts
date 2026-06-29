import type { OfficialFinancialsPayload } from '../types/valuation'

const MAX_AUTO_ACCEPTED_PUBLIC_FILING_EBITDA_MARGIN = 0.9

export const UNTRUSTED_OPERATING_FINANCIAL_PREFILL_KEYS = [
  'revenue',
  'annual_revenue',
  'ebitda',
  'annual_profit',
  'net_income',
  'current_year_data',
  'historical_years_data',
  'year_data',
  'yearData',
  'yearlyFinancials',
  '_financial_data_source',
] as const

type OfficialFinancialsRecord = OfficialFinancialsPayload & Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function officialHistoricalYears(officialFinancials: OfficialFinancialsPayload): unknown[] {
  const record = officialFinancials as OfficialFinancialsRecord
  const years = record.historicalYears ?? record.historical_years
  return Array.isArray(years) ? years : []
}

function excludedValuationYears(officialFinancials: OfficialFinancialsPayload): unknown[] {
  const record = officialFinancials as OfficialFinancialsRecord
  const years = record.excludedValuationYears ?? record.excluded_valuation_years
  return Array.isArray(years) ? years : []
}

function readFiscalYear(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined
  const raw = value.fiscalYear ?? value.fiscal_year
  const year = typeof raw === 'number' ? raw : Number(raw)
  return Number.isInteger(year) ? year : undefined
}

function hasUnsafeOperatingValues(value: unknown): boolean {
  if (!isRecord(value)) return false
  if ((value.revenueSource ?? value.revenue_source) === 'gross_margin') return true
  const revenue = finiteNumber(value.revenue)
  const ebitda = finiteNumber(value.ebitda)
  return (
    revenue != null &&
    revenue > 0 &&
    ebitda != null &&
    ebitda >= 0 &&
    ebitda / revenue >= MAX_AUTO_ACCEPTED_PUBLIC_FILING_EBITDA_MARGIN
  )
}

export function officialFinancialsRejectsValuationInputs(
  officialFinancials: OfficialFinancialsPayload | null | undefined
): boolean {
  if (!officialFinancials) return false
  const record = officialFinancials as OfficialFinancialsRecord
  if ((record.valuationInputStatus ?? record.valuation_input_status) === 'all_rejected') {
    return true
  }

  const historicalYears = officialHistoricalYears(officialFinancials)
  if (historicalYears.length === 0) return false

  const excludedYears = new Set(
    excludedValuationYears(officialFinancials)
      .map(readFiscalYear)
      .filter((year): year is number => year != null)
  )
  if (
    excludedYears.size > 0 &&
    historicalYears.every((year) => {
      const fiscalYear = readFiscalYear(year)
      return fiscalYear != null && excludedYears.has(fiscalYear)
    })
  ) {
    return true
  }

  return historicalYears.every((year) => hasUnsafeOperatingValues(year))
}

export function isTrustedFinancialDataSource(source: unknown): boolean {
  if (typeof source !== 'string') return false
  const normalized = source.trim().toLowerCase()
  return (
    normalized === 'accounting_integration' ||
    normalized === 'silverfin' ||
    normalized === 'exact' ||
    normalized === 'exact_online' ||
    normalized === 'xero' ||
    normalized === 'quickbooks' ||
    normalized === 'yuki' ||
    normalized === 'octopus' ||
    normalized === 'winbooks' ||
    normalized === 'afas' ||
    normalized === 'sage' ||
    normalized === 'twinfield' ||
    normalized === 'moneybird' ||
    normalized === 'bexio'
  )
}

export function financialSourceFromSurface(surface: Record<string, unknown>): unknown {
  return surface._financial_data_source ?? surface.financial_data_source ?? surface.dataSource
}

export function officialFinancialsFromSurface(
  surface: Record<string, unknown> | null | undefined
): OfficialFinancialsPayload | undefined {
  if (!surface) return undefined
  const raw = surface.official_financials ?? surface.officialFinancials
  return isRecord(raw) ? (raw as OfficialFinancialsPayload) : undefined
}

export function shouldBlockUntrustedFinancialPrefill(
  officialFinancials: OfficialFinancialsPayload | null | undefined,
  financialDataSource?: unknown
): boolean {
  return (
    officialFinancialsRejectsValuationInputs(officialFinancials) &&
    !isTrustedFinancialDataSource(financialDataSource)
  )
}

export function stripUntrustedOperatingFinancialPrefill<T extends Record<string, unknown>>(
  value: T
): T {
  const next = { ...value }
  for (const key of UNTRUSTED_OPERATING_FINANCIAL_PREFILL_KEYS) {
    delete next[key]
  }
  return next
}

export function stripBlockedUntrustedOperatingFinancialSurface<T extends Record<string, unknown>>(
  surface: T
): T {
  return shouldBlockUntrustedFinancialPrefill(
    officialFinancialsFromSurface(surface),
    financialSourceFromSurface(surface)
  )
    ? stripUntrustedOperatingFinancialPrefill(surface)
    : surface
}
