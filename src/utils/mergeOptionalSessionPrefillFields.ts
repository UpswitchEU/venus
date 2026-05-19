/**
 * Copy method-agnostic valuation inputs from Mercury/session JSON into form updates
 * only when the target field is still empty. Shared by multiples, DCF, NAV, Adaptive,
 * fiscal (SME rate / deal structure), trust (official_financials / variance / badge),
 * venture (`startup_inputs`, `cap_table`), and Waarderingssynthese (`user_weights`).
 *
 * Also gap-fills multi-year history and forecast rows when the session/integration
 * payload carries them but bootstrap only hydrated identity — keeps
 * {@link useSessionOptionalMethodPrefill} aligned with {@link useSessionDataPrefill}.
 *
 * `business_context`: when the form has identity (KBO) but Hermes has not yet stamped
 * `_imported_*` blobs, merges those keys without overwriting user-facing card fields.
 */

import { SESSION_PRE_SELECTED_METHODS_KEY } from '../constants/sessionUiKeys'
import type {
  OfficialFinancialsPayload,
  ValuationFormData,
  YearDataInput,
} from '../types/valuation'
import {
  isFilingYearConfirmedValue,
  normalizeCurrentYearForFiling,
  normalizeHistoricalYearsForFiling,
} from './fiscalYear'
import { hasUsableOfficialFinancialsContent } from './officialFinancialsContent'
import type { YearlyFinancialLike } from './yearlyFinancials'
import {
  buildYearlyFinancialsFromCurrentAndHistorical,
  yearlyFinancialsContainsNonPlaceholderData,
} from './yearlyFinancials'
import {
  OPTIONAL_SCALAR_KEYS,
  OPTIONAL_SESSION_STRUCT_SYNC_KEYS,
  SESSION_CARD_FALLBACK_NULLISH_SCALARS,
  SESSION_CARD_FALLBACK_STRING_KEYS,
  SKIP_BUSINESS_CONTEXT_SCALAR_PROMOTE,
} from './optionalSessionPrefillKeys'

export {
  OPTIONAL_SESSION_PREFILL_SCALAR_KEYS,
  OPTIONAL_SESSION_STRUCT_SYNC_KEYS,
} from './optionalSessionPrefillKeys'

/**
 * Session/bootstrap often ships multi-year figures as a map (`year_data`) rather than
 * `historical_years_data` — align with {@link SessionNormalizer}.
 */
function historicalRowsFromYearDataBlob(
  yearData: unknown
): Array<{ year: number; revenue?: number; ebitda?: number }> | null {
  if (yearData == null || typeof yearData !== 'object' || Array.isArray(yearData)) return null
  const o = yearData as Record<string, { revenue?: number; ebitda?: number } | unknown>
  const years = Object.keys(o)
    .map((k) => Number.parseInt(k, 10))
    .filter((y) => Number.isFinite(y) && y >= 2000 && y <= 2100)
  if (years.length === 0) return null
  return years
    .sort((a, b) => a - b)
    .map((year) => {
      const raw = o[String(year)] ?? o[year]
      const data =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as { revenue?: number; ebitda?: number })
          : {}
      return { year, revenue: data.revenue, ebitda: data.ebitda }
    })
}

/**
 * When Mercury writes placeholder `''` at the top level but the real value lives on the
 * business card blob, `{ ...bi, ...sd }` would keep the empty string. Fill from the card
 * only for blank / nullish placeholders — a non-empty top-level value still wins.
 */
function isBlankSessionString(value: unknown): boolean {
  return value === '' || (typeof value === 'string' && value.trim() === '')
}

function yearDataLikeEmpty(value: unknown): boolean {
  if (value == null) return true
  if (typeof value !== 'object' || Array.isArray(value)) return true
  return Object.keys(value as object).length === 0
}

function currentYearDataVacant(value: unknown): boolean {
  if (value == null) return true
  if (typeof value !== 'object' || Array.isArray(value)) return false
  const o = value as Record<string, unknown>
  const y = o.year
  const hasYear = y != null && String(y).trim() !== ''
  const hasFigures =
    (o.revenue != null && Number.isFinite(Number(o.revenue))) ||
    (o.ebitda != null && Number.isFinite(Number(o.ebitda))) ||
    (o.free_cash_flow != null && Number.isFinite(Number(o.free_cash_flow)))
  if (Object.keys(o).length === 0) return true
  return !hasYear && !hasFigures
}

function coalesceCardUnderEmptyTopLevel(
  merged: Record<string, unknown>,
  bi: Record<string, unknown>
): void {
  for (const key of SESSION_CARD_FALLBACK_STRING_KEYS) {
    if (!isBlankSessionString(merged[key])) continue
    const b = bi[key]
    if (b === undefined || b === null) continue
    if (typeof b === 'string' && b.trim() === '') continue
    merged[key] = b
  }

  for (const key of SESSION_CARD_FALLBACK_NULLISH_SCALARS) {
    const v = merged[key]
    if (v !== undefined && v !== null) continue
    const b = bi[key]
    if (b === undefined || b === null) continue
    merged[key] = b
  }

  const mh = merged['historical_years_data']
  const bh = bi['historical_years_data']
  if (Array.isArray(mh) && mh.length === 0 && Array.isArray(bh) && bh.length > 0) {
    merged['historical_years_data'] = bh
  }

  const mf = merged['forecast_years_data']
  const bf = bi['forecast_years_data']
  if (Array.isArray(mf) && mf.length === 0 && Array.isArray(bf) && bf.length > 0) {
    merged['forecast_years_data'] = bf
  }

  for (const yk of ['year_data', 'yearData'] as const) {
    if (!yearDataLikeEmpty(merged[yk])) continue
    const b = bi[yk]
    if (b == null || yearDataLikeEmpty(b)) continue
    merged[yk] = b
  }

  if (
    currentYearDataVacant(merged['current_year_data']) &&
    !currentYearDataVacant(bi['current_year_data'])
  ) {
    merged['current_year_data'] = bi['current_year_data']
  }
}

/**
 * Flatten `_businessInfo` into the session record (top-level wins), then recover values
 * hidden behind empty top-level placeholders (Mercury/Titan client-invite shape).
 *
 * **Single read contract for session → form:** manual saves use a flat `sessionData`
 * shape; integrations add richer figures on the same keys — not a parallel hierarchy.
 */
export function mergeSessionSurfaceForOptionalPrefill(
  sessionData: unknown
): Record<string, unknown> {
  if (!sessionData || typeof sessionData !== 'object' || Array.isArray(sessionData)) {
    return {}
  }
  const sd = sessionData as Record<string, unknown> & {
    _businessInfo?: Record<string, unknown>
  }
  const bi =
    sd._businessInfo && typeof sd._businessInfo === 'object' && !Array.isArray(sd._businessInfo)
      ? (sd._businessInfo as Record<string, unknown>)
      : {}
  const merged: Record<string, unknown> = { ...bi, ...sd }
  coalesceCardUnderEmptyTopLevel(merged, bi)
  return merged
}

/** True when merged session JSON carries registry identity (includes `_businessInfo`). */
export function sessionEnvelopeHasIdentitySignals(sessionData: unknown): boolean {
  const merged = mergeSessionSurfaceForOptionalPrefill(sessionData) as Record<string, unknown>
  return !!(
    (typeof merged.company_name === 'string' && merged.company_name.trim() !== '') ||
    merged.kbo_number ||
    merged.kboNumber ||
    merged.vat_number ||
    merged.vatNumber
  )
}

function sortedFinancialRowsFingerprint(rows: unknown): string {
  if (!Array.isArray(rows) || rows.length === 0) return ''
  const parts: string[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const r = row as Record<string, unknown>
    const y = Number(r.year)
    if (!Number.isFinite(y)) continue
    const forecast = r.is_forecast ?? r.isForecast ?? ''
    parts.push(`${y}:${r.revenue ?? ''}:${r.ebitda ?? ''}:${r.free_cash_flow ?? ''}:${forecast}`)
  }
  parts.sort((a, b) => Number(a.split(':')[0]) - Number(b.split(':')[0]))
  return parts.join(';')
}

/** Manual grid rows use string `year` — separate from engine `YearDataInput` fingerprint. */
function sortedYearlyGridFingerprint(rows: unknown): string {
  if (!Array.isArray(rows) || rows.length === 0) return ''
  const parts: string[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const r = row as Record<string, unknown>
    const y = Number.parseInt(String(r.year ?? ''), 10)
    if (!Number.isFinite(y) || y < 2000 || y > 2100) continue
    const forecast = r.isForecast ?? r.is_forecast ?? ''
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
    // The count is compared between form and session signatures inside
    // ``areFormAndSessionDataEqualForAutosync``; forms never carry the
    // session-only envelope keys (``_businessInfo``, ``_taxLatencies``,
    // ``_normalizations``, etc.), so counting them on the session side
    // made every flattened session look fatter than the equivalent form
    // and triggered a spurious PATCH on every bootstrap hydration that
    // included Mercury card data (METANOUS revisit regression). Each
    // tracked underscore key already has its own dedicated signature
    // piece below (tax_latencies, _normalizations, _financial_data_source,
    // _import_quality, _imported_ledger_analysis, _imported_saas_metrics,
    // _pre_selected_valuation_methods, _internal_*), so dropping them
    // from the cardinality doesn't lose change-detection — it only stops
    // double-counting + restores form/session signature symmetry.
    if (k.startsWith('_')) continue
    n++
  }
  return n
}

/**
 * Compact stable fingerprint of optional prefill *sources* (session JSON, package blob).
 * Ignores unrelated session keys so referential churn does not false-positive as “changed”.
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

  // Hermes/integration + NBB overlays: not in OPTIONAL_SCALAR_KEYS but must bump the
  // session signature so gap-fill reruns after async enrichment or Mercury merges.
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

  // Chunked delivery (Titan bootstrap, loadSession): identity-only blobs used to yield an empty
  // optional fingerprint (company / kbo are not OPTIONAL_SCALAR_KEYS), so gap-fill effects
  // missed later financial imports. Anchor identity + meaningful session envelope cardinality.
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
    typeof record['kbo_number'] === 'string'
      ? record['kbo_number'].trim().slice(0, 48)
      : typeof record['kboNumber'] === 'string'
        ? record['kboNumber'].trim().slice(0, 48)
        : ''
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

function isEmptySlot(existing: unknown): boolean {
  if (existing === undefined || existing === null) return true
  if (typeof existing === 'string' && existing.trim() === '') return true
  return false
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isOptionalZeroPlaceholder(key: string, existing: unknown): boolean {
  if (!isFiniteNumber(existing) || existing !== 0) return false
  if (key === 'shares_for_sale' || key === 'number_of_owners') return false
  if (key === 'revenue' || key === 'ebitda') return true
  if (key.startsWith('dcf_')) return true
  if (key.startsWith('nav_')) return true
  if (key.startsWith('saas_')) return true
  if (key.startsWith('rev_')) return true
  if (key === 'recurring_revenue_percentage') return true
  if (key === 'government_bond_yield') return true
  if (key === 'long_term_gdp_growth') return true
  if (key === 'owner_salary_addback') return true
  if (key === 'preparer_ev_ebitda_median') return true
  return false
}

function isEmptyStructSlot(existing: unknown): boolean {
  if (existing == null) return true
  if (Array.isArray(existing)) return existing.length === 0
  if (typeof existing === 'object') return Object.keys(existing as object).length === 0
  return false
}

export function mergeOptionalSessionPrefillFields(
  mergedData: Record<string, unknown>,
  /** Zustand store, session JSON, or panel local state — overlapping keys, distinct TS types. */
  formData: unknown
): Partial<ValuationFormData> {
  const out: Partial<ValuationFormData> = {}

  const fd = formData as Record<string, unknown>
  for (const key of OPTIONAL_SCALAR_KEYS) {
    if (!Object.hasOwn(mergedData, key)) continue
    const incoming = mergedData[key]
    if (incoming === undefined || incoming === null) continue
    const existing = fd[key]
    if (!isEmptySlot(existing)) {
      const canBackfillZeroPlaceholder =
        isOptionalZeroPlaceholder(key, existing) && isFiniteNumber(incoming) && incoming !== 0
      if (!canBackfillZeroPlaceholder) continue
    }
    ;(out as Record<string, unknown>)[key] = incoming
  }

  // Registry / `_businessInfo` keys — extractFormData only reads flat session rows.
  for (const key of SESSION_CARD_FALLBACK_STRING_KEYS) {
    if (!Object.hasOwn(mergedData, key)) continue
    const incoming = mergedData[key]
    if (incoming === undefined || incoming === null) continue
    if (typeof incoming === 'string' && incoming.trim() === '') continue
    const existing = fd[key]
    if (!isEmptySlot(existing)) continue
    ;(out as Record<string, unknown>)[key] = incoming
  }
  for (const key of SESSION_CARD_FALLBACK_NULLISH_SCALARS) {
    if (!Object.hasOwn(mergedData, key)) continue
    const incoming = mergedData[key]
    if (incoming === undefined || incoming === null) continue
    if (typeof incoming === 'number' && !Number.isFinite(incoming)) continue
    const existing = fd[key]
    if (existing !== undefined && existing !== null) continue
    ;(out as Record<string, unknown>)[key] = incoming
  }

  for (const key of OPTIONAL_SESSION_STRUCT_SYNC_KEYS) {
    if (!Object.hasOwn(mergedData, key)) continue
    const incoming = mergedData[key]
    if (incoming == null) continue
    const existing = fd[key]
    if (!isEmptyStructSlot(existing)) continue
    ;(out as Record<string, unknown>)[key] = incoming
  }

  if (!(out as Record<string, unknown>)['user_weights'] && isEmptyStructSlot(fd['user_weights'])) {
    const uwAlt = mergedData['_user_weights']
    if (
      uwAlt &&
      typeof uwAlt === 'object' &&
      !Array.isArray(uwAlt) &&
      Object.keys(uwAlt as object).length > 0
    ) {
      out.user_weights = uwAlt as ValuationFormData['user_weights']
    }
  }

  const hasScalarValue = (value: unknown): boolean => {
    if (value === undefined || value === null) return false
    if (typeof value === 'string') return value.trim().length > 0
    return true
  }
  const hasStructValue = (value: unknown): boolean => {
    if (value === undefined || value === null) return false
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'object') return Object.keys(value as object).length > 0
    return true
  }
  const incomingBcForPromote = mergedData['business_context']
  if (
    incomingBcForPromote &&
    typeof incomingBcForPromote === 'object' &&
    !Array.isArray(incomingBcForPromote)
  ) {
    const bc = incomingBcForPromote as Record<string, unknown>
    for (const key of OPTIONAL_SCALAR_KEYS) {
      if (SKIP_BUSINESS_CONTEXT_SCALAR_PROMOTE.has(key)) continue
      if ((out as Record<string, unknown>)[key] !== undefined) continue
      if (!isEmptySlot(fd[key])) continue
      const incoming = bc[key]
      if (hasScalarValue(incoming)) {
        ;(out as Record<string, unknown>)[key] = incoming
      }
    }

    for (const key of OPTIONAL_SESSION_STRUCT_SYNC_KEYS) {
      if ((out as Record<string, unknown>)[key] !== undefined) continue
      if (!isEmptyStructSlot(fd[key])) continue
      const incoming = bc[key]
      if (hasStructValue(incoming)) {
        ;(out as Record<string, unknown>)[key] = incoming
      }
    }

    const camelToInternal: [string, string][] = [
      ['keyMetrics', '_internal_key_metrics'],
      ['typicalEmployeeRange', '_internal_typical_employee_range'],
      ['typicalRevenueRange', '_internal_typical_revenue_range'],
      ['dcfPreference', '_internal_dcf_preference'],
      ['multiplesPreference', '_internal_multiples_preference'],
      ['ownerDependencyImpact', '_internal_owner_dependency_impact'],
    ]
    for (const [camel, snake] of camelToInternal) {
      if ((out as Record<string, unknown>)[snake] !== undefined) continue
      const cur = fd[snake]
      if (cur !== undefined && cur !== null) continue
      const incoming = bc[camel]
      if (incoming !== undefined && incoming !== null) {
        ;(out as Record<string, unknown>)[snake] = incoming
      }
    }
  }

  // Belgian trust / filing overlays (NBB) — gated so empty UI stubs never block real session data.
  const incomingOfficial = mergedData.official_financials
  if (
    incomingOfficial &&
    typeof incomingOfficial === 'object' &&
    !Array.isArray(incomingOfficial) &&
    !hasUsableOfficialFinancialsContent(
      fd.official_financials as OfficialFinancialsPayload | undefined
    ) &&
    hasUsableOfficialFinancialsContent(incomingOfficial as OfficialFinancialsPayload)
  ) {
    out.official_financials = incomingOfficial as ValuationFormData['official_financials']
    const nestedVa = (incomingOfficial as OfficialFinancialsPayload).varianceAnalysis
    if (
      nestedVa &&
      typeof nestedVa === 'object' &&
      !Array.isArray(nestedVa) &&
      isEmptyStructSlot(fd.official_variance_analysis)
    ) {
      out.official_variance_analysis = nestedVa as ValuationFormData['official_variance_analysis']
    }
  }

  const incomingVaTop = mergedData.official_variance_analysis
  if (
    incomingVaTop &&
    typeof incomingVaTop === 'object' &&
    !Array.isArray(incomingVaTop) &&
    isEmptyStructSlot(fd.official_variance_analysis)
  ) {
    out.official_variance_analysis =
      incomingVaTop as ValuationFormData['official_variance_analysis']
  }

  const incomingVerif = mergedData.official_verification_badge
  if (
    incomingVerif &&
    typeof incomingVerif === 'object' &&
    !Array.isArray(incomingVerif) &&
    isEmptyStructSlot(fd.official_verification_badge)
  ) {
    out.official_verification_badge =
      incomingVerif as ValuationFormData['official_verification_badge']
  }

  const existingTl = fd['tax_latencies'] ?? fd['_taxLatencies']
  const incomingTl =
    (Array.isArray(mergedData.tax_latencies) ? mergedData.tax_latencies : undefined) ??
    (Array.isArray(mergedData.taxLatencies) ? mergedData.taxLatencies : undefined) ??
    (Array.isArray(mergedData._taxLatencies) ? mergedData._taxLatencies : undefined)
  if (
    Array.isArray(incomingTl) &&
    incomingTl.length > 0 &&
    (!Array.isArray(existingTl) || existingTl.length === 0)
  ) {
    out.tax_latencies = incomingTl as ValuationFormData['tax_latencies']
  }

  const existingNormalizations = fd['_normalizations']
  if (
    Array.isArray(mergedData._normalizations) &&
    mergedData._normalizations.length > 0 &&
    (!Array.isArray(existingNormalizations) || existingNormalizations.length === 0)
  ) {
    ;(out as Record<string, unknown>)._normalizations = mergedData._normalizations
  }

  const existingBsa = fd['balance_sheet_adjustments']
  if (
    Array.isArray(mergedData.balance_sheet_adjustments) &&
    mergedData.balance_sheet_adjustments.length > 0 &&
    (!Array.isArray(existingBsa) || existingBsa.length === 0)
  ) {
    out.balance_sheet_adjustments =
      mergedData.balance_sheet_adjustments as ValuationFormData['balance_sheet_adjustments']
  }

  const existingComp = fd['comparables']
  if (
    Array.isArray(mergedData.comparables) &&
    mergedData.comparables.length > 0 &&
    (!Array.isArray(existingComp) || existingComp.length === 0)
  ) {
    out.comparables = mergedData.comparables as ValuationFormData['comparables']
  }

  if (mergedData.preparer_ev_ebitda_override && !fd['preparer_ev_ebitda_override']) {
    out.preparer_ev_ebitda_override = mergedData.preparer_ev_ebitda_override as NonNullable<
      ValuationFormData['preparer_ev_ebitda_override']
    >
  }

  /** Hermes/accounting payloads — merged without clobbering KBO/card fields already on the form. */
  const BC_INTEGRATION_KEYS = [
    '_imported_ledger_analysis',
    '_imported_saas_metrics',
    '_imported_saas_provenance',
    '_imported_ledger_provenance',
    'company_address',
    'company_status',
    'kbo_verified',
  ] as const
  const fdBc = fd['business_context']
  const incomingBc = mergedData['business_context']
  if (incomingBc && typeof incomingBc === 'object' && !Array.isArray(incomingBc)) {
    const inc = incomingBc as Record<string, unknown>
    if (isEmptyStructSlot(fdBc)) {
      out.business_context = incomingBc as ValuationFormData['business_context']
    } else if (fdBc && typeof fdBc === 'object' && !Array.isArray(fdBc)) {
      const cur = fdBc as Record<string, unknown>
      const next = { ...cur }
      let bcTouched = false
      for (const k of BC_INTEGRATION_KEYS) {
        if (inc[k] == null || inc[k] === undefined) continue
        if (!isEmptyStructSlot(cur[k])) continue
        next[k] = inc[k]
        bcTouched = true
      }
      if (bcTouched) {
        out.business_context = next as ValuationFormData['business_context']
      }
    }
  }

  // Prefer session blob filing flag when normalizing new history (same tick as Titan merge).
  const filingForNormalize =
    (mergedData.filing_year_confirmed as ValuationFormData['filing_year_confirmed'] | undefined) ??
    (fd['filing_year_confirmed'] as ValuationFormData['filing_year_confirmed'] | undefined)

  const existingHy = fd['historical_years_data']
  let incomingHistorical: unknown[] | null = Array.isArray(mergedData.historical_years_data)
    ? mergedData.historical_years_data
    : null
  if (
    (!incomingHistorical || incomingHistorical.length === 0) &&
    (!Array.isArray(existingHy) || existingHy.length === 0)
  ) {
    const fromYearData =
      historicalRowsFromYearDataBlob(mergedData.year_data) ??
      historicalRowsFromYearDataBlob(mergedData.yearData)
    if (fromYearData?.length) incomingHistorical = fromYearData
  }

  if (
    Array.isArray(incomingHistorical) &&
    incomingHistorical.length > 0 &&
    (!Array.isArray(existingHy) || existingHy.length === 0)
  ) {
    const normalized = normalizeHistoricalYearsForFiling(
      incomingHistorical as Array<{
        year: number
        revenue?: number
        ebitda?: number
      }>,
      filingForNormalize
    )
    if (normalized.length > 0) {
      out.historical_years_data = normalized as ValuationFormData['historical_years_data']
    }
  }

  const existingCyd = fd['current_year_data']
  const incomingCurrentYearData = mergedData.current_year_data
  if (
    incomingCurrentYearData &&
    typeof incomingCurrentYearData === 'object' &&
    !Array.isArray(incomingCurrentYearData)
  ) {
    const incoming = incomingCurrentYearData as Record<string, unknown>
    const next: Record<string, unknown> =
      existingCyd && typeof existingCyd === 'object' && !Array.isArray(existingCyd)
        ? { ...(existingCyd as Record<string, unknown>) }
        : {}
    let changed = !existingCyd
    for (const [key, value] of Object.entries(incoming)) {
      if (value === undefined || value === null) continue
      const cur = next[key]
      if (!isEmptySlot(cur)) {
        const canBackfillZeroPlaceholder =
          typeof cur === 'number' &&
          cur === 0 &&
          typeof value === 'number' &&
          Number.isFinite(value) &&
          value !== 0
        if (!canBackfillZeroPlaceholder) continue
      }
      next[key] = value
      changed = true
    }
    if (changed) {
      if (next.year != null) {
        next.year = normalizeCurrentYearForFiling(next.year as number, filingForNormalize)
      }
      out.current_year_data = next as unknown as YearDataInput
    }
  }

  const existingForecast = fd['forecast_years_data']
  if (
    Array.isArray(mergedData.forecast_years_data) &&
    mergedData.forecast_years_data.length > 0 &&
    (!Array.isArray(existingForecast) || existingForecast.length === 0)
  ) {
    out.forecast_years_data =
      mergedData.forecast_years_data as ValuationFormData['forecast_years_data']
  }

  const filingConfirmedExisting = fd['filing_year_confirmed']
  if (
    mergedData.filing_year_confirmed != null &&
    (filingConfirmedExisting === undefined || filingConfirmedExisting === null)
  ) {
    out.filing_year_confirmed =
      mergedData.filing_year_confirmed as ValuationFormData['filing_year_confirmed']
  }

  const sessionCyd = mergedData.current_year_data
  if (sessionCyd && typeof sessionCyd === 'object' && !Array.isArray(sessionCyd)) {
    const c = sessionCyd as Record<string, unknown>
    const rev = c.revenue
    const ebit = c.ebitda
    if (
      isEmptySlot(fd.revenue) &&
      (out as Record<string, unknown>).revenue === undefined &&
      rev != null &&
      Number.isFinite(Number(rev))
    ) {
      out.revenue = Number(rev)
    }
    if (
      isEmptySlot(fd.ebitda) &&
      (out as Record<string, unknown>).ebitda === undefined &&
      ebit != null &&
      Number.isFinite(Number(ebit))
    ) {
      out.ebitda = Number(ebit)
    }
  }

  if (out.current_year_data) {
    const c = out.current_year_data
    if (
      isEmptySlot(fd.revenue) &&
      (out as Record<string, unknown>).revenue === undefined &&
      c.revenue != null &&
      Number.isFinite(Number(c.revenue))
    ) {
      out.revenue = Number(c.revenue)
    }
    if (
      isEmptySlot(fd.ebitda) &&
      (out as Record<string, unknown>).ebitda === undefined &&
      c.ebitda != null &&
      Number.isFinite(Number(c.ebitda))
    ) {
      out.ebitda = Number(c.ebitda)
    }
  }

  const mergedYf = mergedData.yearlyFinancials
  const fdYearlyPrior = fd['yearlyFinancials']
  const formYearlyVacant = !yearlyFinancialsContainsNonPlaceholderData(
    fdYearlyPrior as YearlyFinancialLike[] | undefined
  )
  if (
    Array.isArray(mergedYf) &&
    mergedYf.length > 0 &&
    formYearlyVacant &&
    yearlyFinancialsContainsNonPlaceholderData(mergedYf as YearlyFinancialLike[])
  ) {
    ;(out as Record<string, unknown>).yearlyFinancials = mergedYf
  }

  const effYearlyTail =
    ((out as Record<string, unknown>).yearlyFinancials as YearlyFinancialLike[] | undefined) ??
    (fdYearlyPrior as YearlyFinancialLike[] | undefined)
  if (
    !yearlyFinancialsContainsNonPlaceholderData(effYearlyTail) &&
    (out.historical_years_data || out.current_year_data)
  ) {
    const effCyd = (out.current_year_data ??
      fd['current_year_data']) as ValuationFormData['current_year_data']
    const effHist = (out.historical_years_data ??
      fd['historical_years_data']) as ValuationFormData['historical_years_data']
    const hasHist = Array.isArray(effHist) && effHist.length > 0
    const hasCydYear =
      effCyd && effCyd.year != null && (effCyd.revenue != null || effCyd.ebitda != null || hasHist)
    if (hasHist || hasCydYear) {
      ;(out as Record<string, unknown>).yearlyFinancials =
        buildYearlyFinancialsFromCurrentAndHistorical(effCyd, effHist)
    }
  }

  return out
}

/** Shared by SessionRestorationService and {@link queueOptionalGapFillFlush}. */
export function buildOptionalSessionGapFillPatch(
  rawSessionData: unknown,
  formData: unknown
): Partial<ValuationFormData> {
  if (!rawSessionData || typeof rawSessionData !== 'object') return {}
  const merged = mergeSessionSurfaceForOptionalPrefill(rawSessionData)
  return mergeOptionalSessionPrefillFields(merged, formData)
}
