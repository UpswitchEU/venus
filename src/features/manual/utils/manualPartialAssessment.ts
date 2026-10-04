import { useClientContext } from '@/stores/clientContext'
import { ValidationError } from '@/types/errors'
import { FinancialDecimal } from '@/utils/financialDecimal'
import { reportRecord } from '@/utils/indicativeReportExport'
import { savedPartialAssessment } from '@/utils/partialReportExport'

export interface PartialManualForm {
  companyName?: string
  country?: string
  country_code?: string
  currency?: string
  yearlyFinancials?: readonly unknown[] | null
}

function decimal(value: unknown, field: string): string | null {
  if (value == null || value === '') return null
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    !/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(String(value).trim()) ||
    !Number.isFinite(Number(value))
  )
    throw new ValidationError('Enter a finite decimal amount.', field)
  return String(value).trim()
}

function observed(row: Record<string, unknown>, field: string): string | null {
  const status = reportRecord(row.financial_observations)[field]
  if (status === 'missing' || status === 'placeholder' || status === 'unknown') return null
  return decimal(row[field], field)
}

function identicalAmounts(
  left: Record<string, string | null>,
  right: Record<string, string | null>
): boolean {
  return Object.entries(left).every(([key, value]) =>
    value === null
      ? right[key] === null
      : right[key] !== null && new FinancialDecimal(value).eq(right[key])
  )
}

/** Use the latest actual row as supplied, never a more complete older year,
 * gross margin, a cached normalization, or a forecast disguised as actuals. */
export function buildManualPartialInput(data: PartialManualForm, revision: string, date: string) {
  const rows = (data.yearlyFinancials ?? [])
    .map(reportRecord)
    .filter((row) => row.isForecast !== true && row.is_forecast !== true)
  const dated = rows
    .filter(
      (row) =>
        /^\d{4}$/.test(String(row.year)) && Number(row.year) >= 2000 && Number(row.year) <= 2100
    )
    .sort((a, b) => Number(b.year) - Number(a.year))
  const undated = rows.filter((row) => row.year == null || row.year === '')
  const row = dated[0] ?? undated[0] ?? {}
  const year = row.year == null || row.year === '' ? null : Number(row.year)
  const peers =
    year === null ? undated : dated.filter((candidate) => Number(candidate.year) === year)
  const facts = (candidate: Record<string, unknown>) => ({
    revenue: observed(candidate, 'revenue'),
    ebitda: observed(candidate, 'ebitda'),
    cash: observed(candidate, 'cash'),
    financial_debt: observed(candidate, 'total_debt'),
    // A historical NWC movement is not a transaction closing adjustment.
    nwc_adjustment: null,
  })
  const financials = facts(row)
  if (peers.some((candidate) => !identicalAmounts(facts(candidate), financials)))
    throw new ValidationError('Conflicting financial rows for the same year.', 'yearlyFinancials')
  const rawCountry = (data.country_code ?? data.country ?? '').trim().toUpperCase()
  const country = rawCountry === 'UK' ? 'GB' : /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : null
  const rawCurrency = (data.currency ?? '').trim().toUpperCase()
  return {
    company_name: data.companyName?.trim() || 'Unnamed business',
    country_code: country,
    valuation_date: date,
    evidence_revision_id: revision,
    financials: {
      fiscal_year: year,
      currency: /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : null,
      ...financials,
      source_reference:
        'Manual annual inputs; reported amounts only. No automatic normalization or market multiple supplied.',
    },
    references: [],
  }
}

export async function calculateSavedManualAssessment(
  reportId: string,
  data: PartialManualForm,
  isStillTarget: () => boolean,
  now = new Date()
) {
  const headers = {
    ...useClientContext.getState().getContextHeaders(),
    'Content-Type': 'application/json',
  }
  const url = `/api/valuations/reports/${encodeURIComponent(reportId)}/partial-calculation`
  const headResponse = await fetch(url, { credentials: 'include', cache: 'no-store', headers })
  if (!headResponse.ok) throw new Error('Could not load the current report revision.')
  const head = reportRecord(await headResponse.json())
  if (
    typeof head.report_id !== 'string' ||
    typeof head.revision_sha256 !== 'string' ||
    typeof head.updated_at !== 'string'
  )
    throw new Error('The saved report revision is incomplete.')
  if (!isStillTarget()) return null
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers,
    body: JSON.stringify({
      expected_updated_at: head.updated_at,
      expected_revision_sha256: head.revision_sha256,
      input: buildManualPartialInput(data, head.revision_sha256, now.toISOString().slice(0, 10)),
    }),
  })
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? 'The report changed. Reload before calculating again.'
        : 'The assessment could not be saved. Retry the calculation.'
    )
  const saved = reportRecord(await response.json())
  if (!savedPartialAssessment(saved) || saved.report_id !== head.report_id)
    throw new Error('The saved assessment identity is inconsistent.')
  return isStillTarget() ? saved : null
}
