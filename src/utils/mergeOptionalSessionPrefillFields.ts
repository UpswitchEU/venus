/**
 * Copy method-agnostic valuation inputs from Mercury/session JSON into form updates
 * only when the target field is still empty. Shared by multiples, DCF, NAV, Adaptive.
 */

import type { ValuationFormData } from '../types/valuation'

const OPTIONAL_SCALAR_KEYS = [
  'revenue',
  'ebitda',
  'recurring_revenue_percentage',
  'activity_code',
  'canonical_nace_code',
  'shares_for_sale',
  'net_income',
  'use_dcf',
  'use_multiples',
  'user_configured_dcf',
  'projection_years',
  'dcf_input_mode',
  'government_bond_yield',
  'long_term_gdp_growth',
  'dcf_revenue_growth_pct',
  'dcf_ebitda_margin_pct',
  'dcf_capex_pct',
  'dcf_da_pct',
  'dcf_nwc_pct',
  'dcf_tax_rate_pct',
  'dcf_wacc_pct',
  'dcf_terminal_growth_pct',
  'dcf_exit_multiple',
  'dcf_risk_free_rate_pct',
  'dcf_equity_risk_premium_pct',
  'dcf_beta',
  'dcf_cost_of_debt_pct',
  'dcf_debt_equity_pct',
  'dcf_tax_shield_pct',
  'dcf_terminal_value_method',
  'nav_real_estate_adjustment',
  'nav_inventory_adjustment',
  'nav_hidden_reserves',
  'nav_goodwill_writeoff',
  'nav_receivables_adjustment',
  'nav_other_revaluations',
  'nav_tax_latency_pct',
  'nav_off_balance_items',
  'exclude_real_estate',
  'real_estate_book_value',
  'estimated_market_rent',
  'business_highlights',
  'reason_for_selling',
  'owner_role',
  'owner_hours',
  'delegation_capability',
  'succession_plan',
  'number_of_owners',
  'saas_arr',
  'saas_mrr',
  'saas_arr_growth_pct',
  'saas_churn_pct',
  'saas_customer_churn_pct',
  'saas_nrr_pct',
  'saas_gross_margin_pct',
  'saas_cac',
  'saas_customer_concentration_pct',
  'saas_expansion_revenue_pct',
  'saas_sm_spend',
  'rev_recurring_pct',
  'rev_recurring_amount',
  'rev_top_client_concentration_pct',
  'rev_top_client_amount',
  'rev_contract_backlog',
  'rev_gross_churn_pct',
  'rev_capitalized_rd_amount',
  'owner_salary_addback',
  'preparer_ev_ebitda_median',
  '_internal_dcf_preference',
  '_internal_multiples_preference',
  '_internal_owner_dependency_impact',
] as const

/** Exported for tests and optional-change detection (store subscribe). */
export const OPTIONAL_SESSION_PREFILL_SCALAR_KEYS = OPTIONAL_SCALAR_KEYS

/**
 * Structured fields from business-type / adaptive context (not scalars) — must autosave + fingerprint.
 */
export const OPTIONAL_SESSION_STRUCT_SYNC_KEYS = [
  '_internal_key_metrics',
  '_internal_typical_employee_range',
  '_internal_typical_revenue_range',
] as const

/**
 * Compact stable fingerprint of optional prefill *sources* (session JSON, package blob).
 * Ignores unrelated session keys so referential churn does not false-positive as “changed”.
 */
export function stableOptionalPrefillSourceSignature(record: Record<string, unknown>): string {
  const parts: string[] = []
  for (const key of OPTIONAL_SCALAR_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue
    const incoming = record[key]
    if (incoming === undefined || incoming === null) continue
    if (typeof incoming === 'string' && incoming.trim() === '') continue
    parts.push(`${key}:${String(incoming)}`)
  }
  for (const key of OPTIONAL_SESSION_STRUCT_SYNC_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue
    const incoming = record[key]
    if (incoming === undefined || incoming === null) continue
    parts.push(`${key}:${JSON.stringify(incoming)}`)
  }
  const tl = record['tax_latencies']
  if (Array.isArray(tl) && tl.length > 0) parts.push(`tax_latencies:${tl.length}`)
  const bsa = record['balance_sheet_adjustments']
  if (Array.isArray(bsa) && bsa.length > 0) parts.push(`balance_sheet_adjustments:${bsa.length}`)
  if (record['preparer_ev_ebitda_override']) parts.push('preparer_ev_ebitda_override:1')
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

function isEmptySlot(existing: unknown): boolean {
  if (existing === undefined || existing === null) return true
  if (typeof existing === 'string' && existing.trim() === '') return true
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
    if (!Object.prototype.hasOwnProperty.call(mergedData, key)) continue
    const incoming = mergedData[key]
    if (incoming === undefined || incoming === null) continue
    const existing = fd[key]
    if (!isEmptySlot(existing)) continue
    ;(out as Record<string, unknown>)[key] = incoming
  }

  const existingTl = fd['tax_latencies']
  if (
    Array.isArray(mergedData.tax_latencies) &&
    mergedData.tax_latencies.length > 0 &&
    (!Array.isArray(existingTl) || existingTl.length === 0)
  ) {
    out.tax_latencies = mergedData.tax_latencies as ValuationFormData['tax_latencies']
  }

  const existingBsa = fd['balance_sheet_adjustments']
  if (
    Array.isArray(mergedData.balance_sheet_adjustments) &&
    mergedData.balance_sheet_adjustments.length > 0 &&
    (!Array.isArray(existingBsa) || existingBsa.length === 0)
  ) {
    out.balance_sheet_adjustments = mergedData.balance_sheet_adjustments as ValuationFormData['balance_sheet_adjustments']
  }

  if (mergedData.preparer_ev_ebitda_override && !fd['preparer_ev_ebitda_override']) {
    out.preparer_ev_ebitda_override = mergedData.preparer_ev_ebitda_override as NonNullable<
      ValuationFormData['preparer_ev_ebitda_override']
    >
  }

  return out
}
