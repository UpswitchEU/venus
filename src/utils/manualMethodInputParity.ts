import type { ManualValuationFormData, ValuationFormData } from '../types/valuation'

/**
 * Advanced method inputs are edited inside the manual panel's local state before
 * they are mirrored into the canonical Zustand form. Keep this list explicit so
 * those values (including deliberate clears) survive the local -> store bridge.
 *
 * This is intentionally a transport list only. No monetary calculation or
 * defaulting belongs in the Venus bridge.
 */
export const MANUAL_METHOD_INPUT_PARITY_KEYS = [
  'nav_real_estate_book_value',
  'nav_real_estate_appraisal_value',
  'nav_per_asset_tax_rates',
  'nav_equipment_revaluation',
  'deal_type',
  'deal_goodwill_amount',
  'deal_seller_share_basis',
  'deal_seller_is_individual',
  'deal_buyer_discount_rate_pct',
  'deal_registration_duty_pct',
  'rev_capitalized_rd_amount',
  'liq_headcount',
  'liq_monthly_rent',
  'liq_paid_up_capital',
  'liq_deferred_tax',
  'liq_premise_override',
  'liq_realised_capital_gains',
  'liq_taxable_reserves',
  'liq_runway_months_orderly',
  'liq_runway_months_forced',
  'liq_distress_wacc_orderly',
  'liq_distress_wacc_forced',
  'liq_intangibles_uplift_pct',
  'liq_multiples_value_override',
  'liq_lb_super_preferent_employees',
  'liq_lb_preferent_tax',
  'liq_lb_preferent_other',
  'liq_lb_secured',
  'liq_lb_unsecured',
  'liq_lb_subordinated',
  'liq_lb_estate_costs',
  'liq_ao_land',
  'liq_ao_buildings',
  'liq_ao_machinery_equipment',
  'liq_ao_vehicles',
  'liq_ao_it_equipment',
  'liq_ao_intangibles',
  'liq_ao_inventory_raw',
  'liq_ao_inventory_wip',
  'liq_ao_inventory_finished',
  'liq_ao_trade_receivables',
  'liq_ao_other_receivables',
  'liq_ao_cash',
  'fiscal_acquisition_cost',
  'fiscal_anchor_2_value',
  'fiscal_anchor_3_value',
  'fiscal_anchor_4_value',
] as const satisfies readonly (keyof ValuationFormData)[]

export function pickManualMethodInputParityFields(
  source: Partial<ManualValuationFormData>
): Partial<ValuationFormData> {
  const output: Partial<ValuationFormData> = {}
  const sourceRecord = source as Record<string, unknown>
  const outputRecord = output as Record<string, unknown>

  for (const key of MANUAL_METHOD_INPUT_PARITY_KEYS) {
    if (Object.hasOwn(sourceRecord, key)) {
      outputRecord[key] = sourceRecord[key]
    }
  }

  return output
}
