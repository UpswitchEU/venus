import { isFilingYearConfirmedValue } from './fiscalYear'
import {
  OPTIONAL_SCALAR_KEYS,
  OPTIONAL_SESSION_STRUCT_SYNC_KEYS,
} from './optionalSessionPrefillKeys'
import { getRegistryIdentityFromRecord } from './registryIdentity'
import {
  historicalRowsFromYearDataBlob,
  mergeSessionSurfaceForOptionalPrefill,
} from './sessionSurfacePrefill'
import { isYearRowForecast } from './yearData'
import type { YearlyFinancialLike } from './yearlyFinancials'
import { yearlyFinancialsContainsNonPlaceholderData } from './yearlyFinancials'

// Keep this local to avoid the sessionUiKeys -> method registry initialization cycle.
const SESSION_PRE_SELECTED_METHODS_KEY = '_pre_selected_valuation_methods' as const

function sortedFinancialRowsFingerprint(rows: unknown): string {
  if (!Array.isArray(rows) || rows.length === 0) return ''
  const parts: string[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const r = row as Record<string, unknown>
    const y = Number(r.year)
    if (!Number.isFinite(y)) continue
    const forecast = isYearRowForecast(r) ? '1' : ''
    parts.push(`${y}:${r.revenue ?? ''}:${r.ebitda ?? ''}:${r.free_cash_flow ?? ''}:${forecast}`)
  }
  parts.sort((a, b) => Number(a.split(':')[0]) - Number(b.split(':')[0]))
  return parts.join(';')
}

/** Manual grid rows use string `year` - separate from engine `YearDataInput` fingerprint. */
function sortedYearlyGridFingerprint(rows: unknown): string {
  if (!Array.isArray(rows) || rows.length === 0) return ''
  const parts: string[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const r = row as Record<string, unknown>
    const y = Number.parseInt(String(r.year ?? ''), 10)
    if (!Number.isFinite(y) || y < 2000 || y > 2100) continue
    const forecast = isYearRowForecast(r) ? '1' : ''
    parts.push(`${y}:${r.revenue ?? ''}:${r.ebitda ?? ''}:${r.free_cash_flow ?? ''}:${forecast}`)
  }
  parts.sort((a, b) => Number(a.split(':')[0]) - Number(b.split(':')[0]))
  return parts.join(';')
}

function sessionEnvelopeKeyCount(record: Record<string, unknown>): number {
  let n = 0
  for (const k of Object.keys(record)) {
    if (k.startsWith('_bootstrap')) continue
    // Skip every underscore-prefixed key from the cardinality count.
    // Dedicated signature pieces below still track meaningful session-only fields.
    if (k.startsWith('_')) continue
    n++
  }
  return n
}

/**
 * Compact stable fingerprint of optional prefill sources (session JSON, package blob).
 * Ignores unrelated session keys so referential churn does not false-positive as changed.
 */
export function stableOptionalPrefillSourceSignature(record: Record<string, unknown>): string {
  const parts: string[] = []
  for (const key of OPTIONAL_SCALAR_KEYS) {
    if (!Object.hasOwn(record, key)) continue
    const incoming = record[key]
    if (incoming === undefined || incoming === null) continue
    if (typeof incoming === 'string' && incoming.trim() === '') continue
    parts.push(`${key}:${String(incoming)}`)
  }
  for (const key of OPTIONAL_SESSION_STRUCT_SYNC_KEYS) {
    if (!Object.hasOwn(record, key)) continue
    const incoming = record[key]
    if (incoming === undefined || incoming === null) continue
    parts.push(`${key}:${JSON.stringify(incoming)}`)
  }
  const tl =
    (Array.isArray(record['tax_latencies']) ? record['tax_latencies'] : undefined) ??
    (Array.isArray(record['taxLatencies']) ? record['taxLatencies'] : undefined) ??
    (Array.isArray(record['_taxLatencies']) ? record['_taxLatencies'] : undefined)
  if (Array.isArray(tl) && tl.length > 0) {
    const sig = tl
      .map((x) => {
        const o = x as Record<string, unknown>
        return [
          String(o.type ?? ''),
          String(o.temporary_difference ?? ''),
          String(o.tax_rate ?? ''),
          String(o.description ?? '').slice(0, 40),
        ].join(':')
      })
      .sort()
      .join(';')
    parts.push(`tax_latencies:${tl.length}:${sig}`)
  }
  const norms = record['_normalizations']
  if (Array.isArray(norms) && norms.length > 0) {
    const sig = norms
      .map((x) => {
        const o = x as Record<string, unknown>
        return [
          String(o.id ?? o.frontend_id ?? ''),
          String(o.year ?? ''),
          String(o.status ?? ''),
          String(o.adjustment ?? o.amount ?? ''),
        ].join(':')
      })
      .sort()
      .join(';')
    parts.push(`_normalizations:${norms.length}:${sig}`)
  }
  const bsa = record['balance_sheet_adjustments']
  if (Array.isArray(bsa) && bsa.length > 0) {
    const sig = bsa
      .map((x) => {
        const o = x as Record<string, unknown>
        return [
          String(o.id ?? ''),
          String(o.amount ?? ''),
          String(o.type ?? ''),
          String(o.category ?? ''),
        ].join(':')
      })
      .sort()
      .join(';')
    parts.push(`balance_sheet_adjustments:${bsa.length}:${sig}`)
  }
  const hy = record['historical_years_data']
  if (Array.isArray(hy) && hy.length > 0) {
    const sig = sortedFinancialRowsFingerprint(hy)
    if (sig.length > 0) parts.push(`historical_years_data:${sig}`)
  }
  const yd = record['year_data'] ?? record['yearData']
  if (yd && typeof yd === 'object' && !Array.isArray(yd)) {
    const derived = historicalRowsFromYearDataBlob(yd)
    if (derived?.length) {
      const sig = sortedFinancialRowsFingerprint(derived)
      if (sig.length > 0) parts.push(`year_data:${sig}`)
    }
  }
  const fy = record['forecast_years_data']
  if (Array.isArray(fy) && fy.length > 0) {
    const sig = sortedFinancialRowsFingerprint(fy)
    if (sig.length > 0) parts.push(`forecast_years_data:${sig}`)
  }
  const yfGridFp = record['yearlyFinancials']
  if (
    Array.isArray(yfGridFp) &&
    yfGridFp.length > 0 &&
    yearlyFinancialsContainsNonPlaceholderData(yfGridFp as YearlyFinancialLike[])
  ) {
    const sig = sortedYearlyGridFingerprint(yfGridFp)
    if (sig.length > 0) parts.push(`yearlyFinancials:${sig}`)
  }
  const cyd = record['current_year_data']
  if (cyd && typeof cyd === 'object' && !Array.isArray(cyd)) {
    const c = cyd as Record<string, unknown>
    parts.push(
      `current_year_data:${String(c.year ?? '')}:${c.revenue ?? ''}:${c.ebitda ?? ''}:${c.free_cash_flow ?? ''}`
    )
  }
  if (Object.hasOwn(record, 'filing_year_confirmed')) {
    parts.push(
      `filing_year_confirmed:${isFilingYearConfirmedValue(record['filing_year_confirmed']) ? '1' : '0'}`
    )
  }
  const peo = record['preparer_ev_ebitda_override']
  if (peo && typeof peo === 'object' && !Array.isArray(peo)) {
    const o = peo as Record<string, unknown>
    parts.push(`preparer_ev_ebitda_override:${String(o.reason_key ?? '')}`)
  }

  const fds = record['_financial_data_source']
  if (typeof fds === 'string' && fds.trim().length > 0) {
    parts.push(`_financial_data_source:${fds.trim()}`)
  }

  const iqRaw =
    (record['_import_quality'] !== undefined ? record['_import_quality'] : null) ??
    (record['import_quality'] !== undefined ? record['import_quality'] : null)
  if (iqRaw && typeof iqRaw === 'object' && !Array.isArray(iqRaw)) {
    const iq = iqRaw as Record<string, { confidence_score?: unknown } | unknown>
    const yearKeys = Object.keys(iq).sort().join(',')
    const confSlice = Object.entries(iq)
      .map(([y, row]) =>
        typeof row === 'object' && row && !Array.isArray(row) && 'confidence_score' in row
          ? `${y}:${(row as { confidence_score?: unknown }).confidence_score ?? ''}`
          : `${y}:`
      )
      .sort()
      .join(';')
    if (yearKeys.length > 0) {
      parts.push(`import_quality:${yearKeys}:${confSlice}`)
    }
  }

  const of = record['official_financials']
  if (of && typeof of === 'object' && !Array.isArray(of)) {
    const o = of as Record<string, unknown>
    parts.push(
      `official_financials:${String(o.filingYear ?? o.filing_year ?? '')}:${o.revenue ?? ''}:${o.ebitda ?? ''}`
    )
  }

  const comps = record['comparables']
  if (Array.isArray(comps) && comps.length > 0) {
    const sig = comps
      .map((c) => {
        const x = c as Record<string, unknown>
        return String(x.id ?? x.company_name ?? x.name ?? '').slice(0, 40)
      })
      .sort()
      .join(',')
    parts.push(`comparables:${comps.length}:${sig}`)
  }

  const topLedger = record['_imported_ledger_analysis']
  if (topLedger && typeof topLedger === 'object' && !Array.isArray(topLedger)) {
    const L = topLedger as Record<string, unknown>
    const sdeN = Array.isArray(L.sde_flags) ? L.sde_flags.length : 0
    const tlN = Array.isArray(L.tax_latency_candidates) ? L.tax_latency_candidates.length : 0
    parts.push(`_imported_ledger_analysis:${sdeN}:${tlN}`)
  }

  const bc = record['business_context']
  if (bc && typeof bc === 'object' && !Array.isArray(bc)) {
    const b = bc as Record<string, unknown>
    const nested = b._imported_ledger_analysis
    let ledgerPart = ''
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const L = nested as Record<string, unknown>
      ledgerPart = `${Array.isArray(L.sde_flags) ? L.sde_flags.length : 0}:${Array.isArray(L.tax_latency_candidates) ? L.tax_latency_candidates.length : 0}`
    }
    const sm = b._imported_saas_metrics
    const smKeys =
      sm && typeof sm === 'object' && !Array.isArray(sm)
        ? Object.keys(sm as object)
            .sort()
            .join(',')
        : ''
    const prov = b._imported_saas_provenance
    const provProvider =
      prov && typeof prov === 'object' && !Array.isArray(prov)
        ? String((prov as Record<string, unknown>).provider ?? '')
        : ''
    if (ledgerPart || smKeys || provProvider) {
      parts.push(`business_context_meta:${ledgerPart}:${smKeys}:${provProvider}`)
    }
  }

  const badge = record['official_verification_badge']
  if (badge && typeof badge === 'object' && !Array.isArray(badge)) {
    const b = badge as Record<string, unknown>
    parts.push(`official_verification_badge:${String(b.state ?? '')}`)
  }

  const ova = record['official_variance_analysis']
  if (ova && typeof ova === 'object' && !Array.isArray(ova)) {
    const v = ova as Record<string, unknown>
    parts.push(
      `official_variance_analysis:${String(v.state ?? '')}:${v.maxVariancePercent ?? ''}:${v.revenueVariancePercent ?? ''}:${v.ebitdaVariancePercent ?? ''}`
    )
  }

  const uwSig = record['user_weights'] ?? record['_user_weights']
  if (uwSig && typeof uwSig === 'object' && !Array.isArray(uwSig)) {
    const o = uwSig as Record<string, unknown>
    const keys = Object.keys(o).sort()
    parts.push(
      `user_weights_sig:${keys.join(',')}:${keys.map((k) => `${k}=${String(o[k])}`).join(';')}`
    )
  }

  const persistedMethodsRaw =
    record[SESSION_PRE_SELECTED_METHODS_KEY] ?? record['pre_selected_valuation_methods']
  if (Array.isArray(persistedMethodsRaw) && persistedMethodsRaw.length > 0) {
    const sorted = persistedMethodsRaw
      .filter((m): m is string => typeof m === 'string')
      .sort()
      .join(',')
    parts.push(`pre_selected_valuation_methods:${sorted}`)
  }

  const envCount = sessionEnvelopeKeyCount(record)
  if (envCount > 0) {
    parts.push(`sd_env:${envCount}`)
  }

  const co =
    typeof record['company_name'] === 'string'
      ? record['company_name'].trim().slice(0, 96)
      : typeof record['companyName'] === 'string'
        ? record['companyName'].trim().slice(0, 96)
        : ''
  const kb =
    getRegistryIdentityFromRecord(record)?.slice(0, 48) ??
    (typeof record['kbo_number'] === 'string'
      ? record['kbo_number'].trim().slice(0, 48)
      : typeof record['kboNumber'] === 'string'
        ? record['kboNumber'].trim().slice(0, 48)
        : '')
  if (co) parts.push(`id_company:${co}`)
  if (kb) parts.push(`id_kbo:${kb}`)

  return parts.join('|')
}

/**
 * Fingerprint of optional valuation fields currently present on the form/store snapshot.
 * Used to coalesce Zustand notifications when only non-optional fields change.
 */
export function stableOptionalFormSliceSignature(formData: unknown): string {
  const fd = formData as Record<string, unknown>
  return stableOptionalPrefillSourceSignature(fd)
}

export function getSessionOptionalPrefillSignature(sessionData: unknown): string {
  return stableOptionalPrefillSourceSignature(mergeSessionSurfaceForOptionalPrefill(sessionData))
}
