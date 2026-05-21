import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  OPTIONAL_SESSION_PREFILL_SCALAR_KEYS,
  OPTIONAL_SESSION_STRUCT_SYNC_KEYS,
} from '../../utils/mergeOptionalSessionPrefillFields'
import { PRIMARY_OMNI_METHOD_ORDER } from '../omniCalcMethods'

const METHOD_PREFILL_MATRIX: Record<(typeof PRIMARY_OMNI_METHOD_ORDER)[number], string[]> = {
  upswitch_adaptive: [
    'business_description',
    'subIndustry',
    'taxonomy',
    'number_of_employees',
    'canonical_nace_code',
  ],
  arr_multiple: ['saas_arr', 'saas_nrr_pct', '_imported_saas_metrics'],
  ebitda_multiple: ['rev_recurring_pct', 'rev_top_client_concentration_pct'],
  omzet_multiple: ['rev_recurring_pct', 'rev_top_client_concentration_pct'],
  revenue_multiple: ['rev_recurring_pct', 'rev_top_client_concentration_pct'],
  sde_multiple: ['owner_salary_addback', '_imported_ledger_analysis', '_normalizations'],
  dcf: [
    'dcf_wacc_pct',
    'dcf_terminal_growth_pct',
    'dcf_discounting_convention',
    'dcf_tax_shield_projections',
    'forecast_years_data',
  ],
  adjusted_nav: ['nav_hidden_reserves', 'nav_per_asset_tax_rates', 'balance_sheet_adjustments'],
  fiscal_4x: [
    'taxable_profit',
    'director_remuneration',
    'sme_rate_override',
    'official_financials',
  ],
  // Liquidation runs on the same balance-sheet inputs as adjusted_nav
  // (no extra prefill surface needed today — the engine reads from the
  // current_year_data totals + cash/AR/inventory). When NACE-mapped
  // recovery factors land via Delphi, this list grows to include the
  // sector-driven knobs.
  liquidation_analysis: ['balance_sheet_adjustments'],
}

const OPTIONAL_SURFACE = new Set<string>([
  ...OPTIONAL_SESSION_PREFILL_SCALAR_KEYS,
  ...OPTIONAL_SESSION_STRUCT_SYNC_KEYS,
  '_pre_selected_valuation_methods',
  'official_financials',
  'official_variance_analysis',
  'official_verification_badge',
  'tax_latencies',
  '_taxLatencies',
  '_normalizations',
  'balance_sheet_adjustments',
  'comparables',
  '_imported_ledger_analysis',
  '_imported_saas_metrics',
  '_imported_saas_provenance',
  'business_context',
  'forecast_years_data',
  'current_year_data',
  'historical_years_data',
  'year_data',
  'yearData',
  'yearlyFinancials',
])

describe('Omni prefill coverage contract', () => {
  it('tracks persisted multi-method selection for gap-fill', () => {
    expect(OPTIONAL_SESSION_STRUCT_SYNC_KEYS).toContain('_pre_selected_valuation_methods')
  })

  it('keeps the 10-key Omni method order', () => {
    expect(PRIMARY_OMNI_METHOD_ORDER).toHaveLength(10)
  })

  it.each(PRIMARY_OMNI_METHOD_ORDER)('covers method %s in prefill matrix', (method) => {
    const required = METHOD_PREFILL_MATRIX[method]
    expect(required?.length).toBeGreaterThan(0)
    for (const key of required) {
      expect(OPTIONAL_SURFACE.has(key)).toBe(true)
    }
  })

  it('keeps bootstrap mappings for KBO/taxonomy/enrichment parity', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'hooks', 'useBootstrapSync.ts'),
      'utf8'
    )
    for (const key of [
      'canonical_nace_code',
      'taxonomy',
      'net_income',
      'number_of_employees',
      'employee_count',
      '_imported_saas_metrics',
      '_imported_ledger_analysis',
      'official_financials',
    ]) {
      expect(src).toContain(key)
    }
  })

  it('keeps existing-session package gap-fill path in bootstrap sync', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'hooks', 'useBootstrapSync.ts'),
      'utf8'
    )
    expect(src).toContain('mergeSessionSurfaceForOptionalPrefill(pkg.formData)')
    expect(src).toContain('Hydrated form store with bootstrap/package gap-fill')
    expect(src).toContain('Updated existing session with bootstrap/package gap-fill data')
  })
})
