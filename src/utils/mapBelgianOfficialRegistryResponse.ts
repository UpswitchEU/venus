/**
 * Maps Titan/Delphi Belgian official financials API payload to Venus OfficialFinancials.
 * Kept aligned with titan bootstrap fetchOfficialBelgianFinancials mapping.
 */

import type { OfficialFinancials } from '../lib/bootstrap/types'

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

  return {
    source: typeof official.source === 'string' ? official.source : 'staatsbladmonitor',
    sourceLabel:
      typeof official.source_label === 'string'
        ? official.source_label
        : 'NBB filing via Staatsbladmonitor',
    filingYear: toOptionalFilingYear(official.filing_year),
    revenue: toOptionalFiniteNumber(official.revenue),
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
      state:
        response.status === 'ok'
          ? 'verified'
          : response.status === 'partial'
            ? 'partial'
            : 'unavailable',
      label:
        response.status === 'ok'
          ? 'Verified by NBB'
          : response.status === 'partial'
            ? 'Partial official filing'
            : 'Official filing unavailable',
    },
  }
}
