/**
 * Maps Titan/Delphi Belgian official financials API payload to Venus OfficialFinancials.
 * Kept aligned with titan bootstrap fetchOfficialBelgianFinancials mapping.
 */

import type { OfficialFinancials, OfficialFinancialsYear } from '../lib/bootstrap/types'

/** Delphi/Titan JSON may emit numbers as strings; keep mapper tolerant. */
function toOptionalFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function toOptionalFilingYear(value: unknown): number | undefined {
  const n = toOptionalFiniteNumber(value)
  if (n === undefined) return undefined
  const y = Math.trunc(n)
  return y >= 1800 && y <= 2200 ? y : undefined
}

function normalizedString(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function toRevenueSource(value: unknown): 'turnover' | 'gross_margin' | undefined {
  const normalized = normalizedString(value)
  if (normalized === 'gross_margin_revenue_proxy') return 'gross_margin'
  return normalized === 'turnover' || normalized === 'gross_margin' ? normalized : undefined
}

function toValuationInputStatus(
  value: unknown
): 'accepted' | 'partial_rejected' | 'all_rejected' | undefined {
  const normalized = normalizedString(value)
  return normalized === 'accepted' ||
    normalized === 'partial_rejected' ||
    normalized === 'all_rejected'
    ? normalized
    : undefined
}

function toValuationInputYears(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined
  if (value.length === 0) return []
  const years = value.flatMap((year): number[] => {
    const parsed = toOptionalFilingYear(year)
    return parsed != null ? [parsed] : []
  })
  return years.length > 0 ? years : undefined
}

function toExcludedValuationYears(
  value: unknown
): OfficialFinancials['excludedValuationYears'] | undefined {
  if (!Array.isArray(value)) return undefined
  const years = value.flatMap(
    (entry): NonNullable<OfficialFinancials['excludedValuationYears']> => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
      const record = entry as Record<string, unknown>
      const fiscalYear = toOptionalFilingYear(record.fiscalYear ?? record.fiscal_year)
      const reason = normalizedString(record.reason)
      if (fiscalYear == null) return []
      if (reason !== 'gross_margin_revenue_proxy' && reason !== 'implausible_ebitda_margin') {
        return []
      }
      return [{ fiscalYear, reason }]
    }
  )
  return years.length > 0 ? years : undefined
}

export function mapBelgianOfficialRegistryResponseToOfficialFinancials(
  response: Record<string, unknown> | null | undefined
): OfficialFinancials | undefined {
  if (!response || response.status === 'invalid_input') {
    return undefined
  }
  if (response.status === 'error') {
    return undefined
  }
  if (response.status !== 'ok' && response.status !== 'partial') {
    return undefined
  }

  const official = (response.official_financials as Record<string, unknown>) || {}
  const revenueSource = toRevenueSource(official.revenueSource ?? official.revenue_source)
  const badgeState =
    response.status === 'ok' && revenueSource !== 'gross_margin'
      ? 'verified'
      : response.status === 'ok' || response.status === 'partial'
        ? 'partial'
        : 'unavailable'
  const badgeLabel =
    revenueSource === 'gross_margin'
      ? 'NBB filing uses gross margin'
      : response.status === 'ok'
        ? 'Verified by NBB'
        : response.status === 'partial'
          ? 'Partial official filing'
          : 'Official filing unavailable'

  return {
    source: typeof official.source === 'string' ? official.source : 'staatsbladmonitor',
    sourceLabel:
      typeof official.source_label === 'string'
        ? official.source_label
        : 'NBB filing via Staatsbladmonitor',
    filingYear: toOptionalFilingYear(official.filing_year),
    revenue: toOptionalFiniteNumber(official.revenue),
    revenueSource,
    ebitda: toOptionalFiniteNumber(official.ebitda),
    totalAssets: toOptionalFiniteNumber(official.total_assets),
    equity: toOptionalFiniteNumber(official.equity),
    pdfUrl: typeof official.pdf_url === 'string' ? official.pdf_url : undefined,
    sourceLinks: Array.isArray(response.source_links)
      ? (response.source_links as string[])
      : undefined,
    cache:
      response.cache && typeof response.cache === 'object'
        ? (response.cache as Record<string, unknown>)
        : undefined,
    quota:
      response.quota && typeof response.quota === 'object'
        ? (response.quota as Record<string, unknown>)
        : undefined,
    dataHealth:
      response.data_health && typeof response.data_health === 'object'
        ? {
            state:
              typeof (response.data_health as Record<string, unknown>).state === 'string'
                ? ((response.data_health as Record<string, unknown>).state as string)
                : undefined,
            message:
              typeof (response.data_health as Record<string, unknown>).message === 'string'
                ? ((response.data_health as Record<string, unknown>).message as string)
                : undefined,
          }
        : undefined,
    variancePolicy: {
      softThresholdPercent: 10,
      hardThresholdPercent: 25,
    },
    varianceAnalysis: {
      state: 'not_started',
      explanationRequired: false,
      severity: 'none',
    },
    verificationBadge: {
      state: badgeState,
      label: badgeLabel,
    },
    historicalYears: mapHistoricalYears(official),
    valuationInputYears: toValuationInputYears(
      official.valuationInputYears ?? official.valuation_input_years
    ),
    excludedValuationYears: toExcludedValuationYears(
      official.excludedValuationYears ?? official.excluded_valuation_years
    ),
    valuationInputStatus: toValuationInputStatus(
      official.valuationInputStatus ?? official.valuation_input_status
    ),
  }
}

function mapHistoricalYears(
  official: Record<string, unknown>
): OfficialFinancialsYear[] | undefined {
  const raw = official.historicalYears ?? official.historical_years
  if (!Array.isArray(raw) || raw.length === 0) return undefined

  return raw.flatMap((yr): OfficialFinancialsYear[] => {
    if (!yr || typeof yr !== 'object' || Array.isArray(yr)) return []
    const record = yr as Record<string, unknown>
    const fiscalYear = toOptionalFilingYear(record.fiscalYear ?? record.fiscal_year)
    if (fiscalYear == null) return []
    const revenueSource = toRevenueSource(record.revenueSource ?? record.revenue_source)
    const rubricsUsed = readRubricsUsed(record.rubricsUsed ?? record.rubrics_used)
    return [
      {
        fiscalYear,
        revenue: toOptionalFiniteNumber(record.revenue),
        ...(revenueSource ? { revenueSource } : {}),
        operatingProfit: toOptionalFiniteNumber(record.operatingProfit ?? record.operating_profit),
        depreciation: toOptionalFiniteNumber(record.depreciation),
        writeOffs: toOptionalFiniteNumber(record.writeOffs ?? record.write_offs),
        provisions: toOptionalFiniteNumber(record.provisions),
        ebitda: toOptionalFiniteNumber(record.ebitda),
        totalAssets: toOptionalFiniteNumber(record.totalAssets ?? record.total_assets),
        equity: toOptionalFiniteNumber(record.equity),
        schemaType:
          record.schemaType === 'abbreviated' || record.schema_type === 'abbreviated'
            ? ('abbreviated' as const)
            : ('full' as const),
        ...(rubricsUsed ? { rubricsUsed } : {}),
      },
    ]
  })
}

function readRubricsUsed(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}
