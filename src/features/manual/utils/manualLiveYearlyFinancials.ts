import { coalesceFiniteNumber } from '@/lib/omniPreview'

export interface ManualLiveYearlyFinancial {
  year: string
  revenue: number
  ebitda: number
  capex?: number
  depreciation?: number
  tax_expense?: number
  cash?: number
  total_debt?: number
  current_assets?: number
  current_liabilities?: number
  accounts_receivable?: number
  accounts_payable?: number
  inventory?: number
  short_term_debt?: number
  nwc_change?: number
  source_provider?: string
  source_kind?: string
  source_synced_at?: string | null
  quality_state?:
    | 'ready'
    | 'source_warning'
    | 'needs_review'
    | 'blocked'
    | 'attested_review'
    | 'advisor_corrected'
  correction_id?: string
  source_digest?: string
  attestation_id?: string
  eligibility_reason?: string
  _source_reconciled?: true
  warning_codes?: string[]
  isForecast?: boolean
}

interface BuildManualLiveYearlyFinancialsParams {
  latestYearlyFinancials?: unknown
  formData: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function readFiniteOptional(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isValidYear(value: unknown): boolean {
  const year = Number(value)
  return Number.isFinite(year) && year >= 2000 && year <= 2100
}

function toLiveYear(row: Record<string, unknown>, isForecast = false): ManualLiveYearlyFinancial {
  const stringValue = (key: string) => (typeof row[key] === 'string' ? row[key] : undefined)
  return {
    year: String(row.year),
    revenue: coalesceFiniteNumber(row.revenue),
    ebitda: coalesceFiniteNumber(row.ebitda),
    capex: readFiniteOptional(row.capex),
    depreciation: readFiniteOptional(row.depreciation),
    tax_expense: readFiniteOptional(row.tax_expense),
    cash: readFiniteOptional(row.cash),
    total_debt: readFiniteOptional(row.total_debt),
    current_assets: readFiniteOptional(row.current_assets),
    current_liabilities: readFiniteOptional(row.current_liabilities),
    accounts_receivable: readFiniteOptional(row.accounts_receivable),
    accounts_payable: readFiniteOptional(row.accounts_payable),
    inventory: readFiniteOptional(row.inventory),
    short_term_debt: readFiniteOptional(row.short_term_debt),
    nwc_change: readFiniteOptional(row.nwc_change),
    source_provider: stringValue('source_provider'),
    source_kind: stringValue('source_kind'),
    source_synced_at: stringValue('source_synced_at'),
    quality_state: stringValue('quality_state') as ManualLiveYearlyFinancial['quality_state'],
    correction_id: stringValue('correction_id'),
    source_digest: stringValue('source_digest'),
    attestation_id: stringValue('attestation_id'),
    eligibility_reason: stringValue('eligibility_reason'),
    ...(row._source_reconciled === true ? { _source_reconciled: true as const } : {}),
    ...(Array.isArray(row.warning_codes)
      ? {
          warning_codes: row.warning_codes.filter(
            (code): code is string => typeof code === 'string' && code.trim().length > 0
          ),
        }
      : {}),
    ...(isForecast ? { isForecast: true } : {}),
  }
}

export function buildManualLiveYearlyFinancials({
  latestYearlyFinancials,
  formData,
}: BuildManualLiveYearlyFinancialsParams): ManualLiveYearlyFinancial[] {
  if (Array.isArray(latestYearlyFinancials) && latestYearlyFinancials.length > 0) {
    return [...(latestYearlyFinancials as ManualLiveYearlyFinancial[])].sort(
      (a, b) => Number(b.year) - Number(a.year)
    )
  }

  const formRecord = asRecord(formData)
  const allYears: ManualLiveYearlyFinancial[] = []
  const pushUniqueYear = (row: Record<string, unknown>, isForecast = false) => {
    if (!isValidYear(row.year)) return
    const year = String(row.year)
    if (allYears.some((existing) => existing.year === year)) return
    allYears.push(toLiveYear(row, isForecast))
  }

  const currentYearData = asRecord(formRecord?.current_year_data)
  if (currentYearData) pushUniqueYear(currentYearData)

  const historicalYearsData = formRecord?.historical_years_data
  if (Array.isArray(historicalYearsData)) {
    for (const row of historicalYearsData) {
      const record = asRecord(row)
      if (record) pushUniqueYear(record)
    }
  }

  const forecastYearsData = formRecord?.forecast_years_data
  if (Array.isArray(forecastYearsData)) {
    for (const row of forecastYearsData) {
      const record = asRecord(row)
      if (record) pushUniqueYear(record, true)
    }
  }

  return allYears.sort((a, b) => Number(b.year) - Number(a.year))
}
