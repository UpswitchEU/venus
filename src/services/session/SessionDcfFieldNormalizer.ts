import { parseFlexibleNumber } from '../../utils/isFiniteNumeric'

const DCF_NUMERIC_SESSION_KEYS = [
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
] as const

export function normalizeDcfSessionFields(fd: Record<string, unknown>): void {
  for (const key of DCF_NUMERIC_SESSION_KEYS) {
    if (!(key in fd)) continue
    const parsed = parseFlexibleNumber(fd[key])
    if (parsed === undefined) {
      delete fd[key]
    } else {
      fd[key] = parsed
    }
  }

  if ('dcf_tax_shield_projections' in fd) {
    if (Array.isArray(fd.dcf_tax_shield_projections)) {
      const parsed = fd.dcf_tax_shield_projections
        .map((value) => parseFlexibleNumber(value))
        .filter((value): value is number => value !== undefined)
      if (parsed.length > 0) {
        fd.dcf_tax_shield_projections = parsed
      } else {
        delete fd.dcf_tax_shield_projections
      }
    } else {
      delete fd.dcf_tax_shield_projections
    }
  }

  if ('dcf_input_mode' in fd) {
    fd.dcf_input_mode = fd.dcf_input_mode === 'fcff_only' ? 'fcff_only' : 'ebitda'
  }

  if ('dcf_discounting_convention' in fd) {
    fd.dcf_discounting_convention =
      fd.dcf_discounting_convention === 'year_end' ? 'year_end' : 'mid_year'
  }

  if ('dcf_terminal_value_method' in fd) {
    const raw = String(fd.dcf_terminal_value_method ?? '').trim()
    if (raw === 'exit_multiple') {
      fd.dcf_terminal_value_method = 'exit_multiple'
    } else if (
      raw === 'perpetual_growth' ||
      raw === 'perpetuity_growth' ||
      raw === 'gordon_growth'
    ) {
      fd.dcf_terminal_value_method = 'perpetual_growth'
    } else {
      fd.dcf_terminal_value_method =
        fd.dcf_exit_multiple != null && fd.dcf_terminal_growth_pct == null
          ? 'exit_multiple'
          : 'perpetual_growth'
    }
  }
}
