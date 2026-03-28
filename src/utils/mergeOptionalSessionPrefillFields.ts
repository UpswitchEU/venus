/**
 * Copy method-agnostic valuation inputs from Mercury/session JSON into form updates
 * only when the target field is still empty. Shared by multiples, DCF, NAV, Adaptive.
 */

import type { ValuationFormData } from '../types/valuation'

const OPTIONAL_SCALAR_KEYS = [
  'shares_for_sale',
  'net_income',
  'use_dcf',
  'use_multiples',
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
  'nav_real_estate_adjustment',
  'nav_inventory_adjustment',
  'nav_hidden_reserves',
  'nav_goodwill_writeoff',
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
  'rev_top_client_concentration_pct',
  'rev_contract_backlog',
  'preparer_ev_ebitda_median',
] as const

function isEmptySlot(existing: unknown): boolean {
  if (existing === undefined || existing === null) return true
  if (typeof existing === 'string' && existing.trim() === '') return true
  return false
}

export function mergeOptionalSessionPrefillFields(
  mergedData: Record<string, unknown>,
  formData: ValuationFormData
): Partial<ValuationFormData> {
  const out: Partial<ValuationFormData> = {}

  const fd = formData as unknown as Record<string, unknown>
  for (const key of OPTIONAL_SCALAR_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(mergedData, key)) continue
    const incoming = mergedData[key]
    if (incoming === undefined || incoming === null) continue
    const existing = fd[key]
    if (!isEmptySlot(existing)) continue
    ;(out as Record<string, unknown>)[key] = incoming
  }

  if (
    Array.isArray(mergedData.tax_latencies) &&
    mergedData.tax_latencies.length > 0 &&
    (!formData.tax_latencies || formData.tax_latencies.length === 0)
  ) {
    out.tax_latencies = mergedData.tax_latencies as ValuationFormData['tax_latencies']
  }

  if (
    Array.isArray(mergedData.balance_sheet_adjustments) &&
    mergedData.balance_sheet_adjustments.length > 0 &&
    (!formData.balance_sheet_adjustments || formData.balance_sheet_adjustments.length === 0)
  ) {
    out.balance_sheet_adjustments = mergedData.balance_sheet_adjustments as ValuationFormData['balance_sheet_adjustments']
  }

  if (mergedData.preparer_ev_ebitda_override && !formData.preparer_ev_ebitda_override) {
    out.preparer_ev_ebitda_override = mergedData.preparer_ev_ebitda_override as NonNullable<
      ValuationFormData['preparer_ev_ebitda_override']
    >
  }

  return out
}
