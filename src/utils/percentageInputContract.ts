import { Decimal } from 'decimal.js'

/** Per-field units travel unchanged; unmarked historical fields retain legacy semantics. */
export const PERCENTAGE_INPUT_FIELDS = [
  'dcf_capex_pct',
  'dcf_company_specific_risk_pct',
  'dcf_cost_of_debt_pct',
  'dcf_da_pct',
  'dcf_debt_equity_pct',
  'dcf_ebitda_margin_pct',
  'dcf_equity_risk_premium_pct',
  'dcf_nwc_pct',
  'dcf_revenue_growth_pct',
  'dcf_risk_free_rate_pct',
  'dcf_sensitivity_ebitda_margin_max_pct',
  'dcf_sensitivity_ebitda_margin_min_pct',
  'dcf_sensitivity_terminal_growth_max_pct',
  'dcf_sensitivity_terminal_growth_min_pct',
  'dcf_sensitivity_wacc_delta_pct',
  'dcf_size_premium_pct',
  'dcf_tax_rate_pct',
  'dcf_tax_shield_pct',
  'dcf_terminal_growth_pct',
  'dcf_wacc_pct',
  'rev_gross_churn_pct',
  'rev_recurring_pct',
  'rev_top_client_concentration_pct',
  'saas_arr_growth_pct',
  'saas_churn_pct',
  'saas_customer_churn_pct',
  'saas_customer_concentration_pct',
  'saas_expansion_revenue_pct',
  'saas_gross_margin_pct',
  'saas_nrr_pct',
] as const
export type PercentageInputField = (typeof PERCENTAGE_INPUT_FIELDS)[number]
export type PercentageInputUnit = 'percentage_points' | 'fraction'
export interface PercentageInputContract {
  schema_version: 'percentage_inputs.v1'
  units: Partial<Record<PercentageInputField, PercentageInputUnit>>
}

export function isPercentageInputField(field: string): field is PercentageInputField {
  return (PERCENTAGE_INPUT_FIELDS as readonly string[]).includes(field)
}

function readContract(value: unknown): PercentageInputContract | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid percentage_input_contract')
  }
  const contract = value as Record<string, unknown>
  if (
    contract.schema_version !== 'percentage_inputs.v1' ||
    Object.keys(contract).some((key) => key !== 'schema_version' && key !== 'units') ||
    !contract.units ||
    typeof contract.units !== 'object' ||
    Array.isArray(contract.units)
  ) {
    throw new Error('Unsupported percentage_input_contract')
  }
  const units: PercentageInputContract['units'] = {}
  for (const [key, unit] of Object.entries(contract.units)) {
    if (!isPercentageInputField(key) || (unit !== 'percentage_points' && unit !== 'fraction')) {
      throw new Error('Unsupported percentage input field or unit')
    }
    units[key] = unit
  }
  if (Object.keys(units).length === 0) throw new Error('Percentage units cannot be empty')
  return { schema_version: 'percentage_inputs.v1', units }
}

/** Only fields authored by this percent-input surface get new annotations. */
export function markAuthoredPercentageInputs(
  context: Record<string, unknown> | undefined,
  authoredFields: Record<string, unknown>
): PercentageInputContract | undefined {
  const existing = readContract(context?.percentage_input_contract)
  const units = { ...existing?.units }
  for (const [key, value] of Object.entries(authoredFields)) {
    if (isPercentageInputField(key) && typeof value === 'number' && Number.isFinite(value)) {
      units[key] = 'percentage_points'
    }
  }
  return Object.keys(units).length ? { schema_version: 'percentage_inputs.v1', units } : undefined
}

/** Convert a declared machine rate only when promoting it into a percent control.
 * Existing top-level form edits already use percentage points. Untagged context
 * replays the engine legacy interpretation before formatting into points.
 */
export function percentageInputForControl(context: Record<string, unknown>, key: string): unknown {
  const raw = context[key]
  if (!isPercentageInputField(key)) return raw
  const unit = readContract(context.percentage_input_contract)?.units[key]
  if (raw == null) return raw
  if (!unit) return legacyPercentageInputForControl(raw, key)
  if (typeof raw !== 'number' && typeof raw !== 'string') throw new Error(`Invalid declared ${key}`)
  let token = String(raw).trim()
  if (token.endsWith('%') || token.endsWith('％')) {
    if (unit !== 'percentage_points') throw new Error(`Conflicting declared ${key} unit`)
    token = token.slice(0, -1).trim()
  }
  if (token.length > 128 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)) {
    throw new Error(`Invalid declared ${key}`)
  }
  const ExactRate = Decimal.clone({ precision: Math.max(32, token.length + 4) })
  const amount = new ExactRate(token)
  const points = unit === 'fraction' ? amount.mul(100) : amount
  const value = points.toNumber()
  if (!Number.isFinite(value)) throw new Error(`Invalid declared ${key}`)
  return value
}

/** Replay the engine's legacy lexical rules only for context-to-control promotion.
 * This preserves recorded interpretation, including its historic separator rules;
 * it does not guess what the original author intended or change saved snapshots.
 */
function legacyPercentageToken(raw: string | number): string {
  if (typeof raw === 'number') return String(raw)
  let token = raw
    .trim()
    .replace(/[\u00a0\u2007\u202f]/g, '')
    .replace(/[%％]$/, '')
    .trim()
  if (token.includes(',') && token.includes('.')) {
    return token.lastIndexOf('.') > token.lastIndexOf(',')
      ? token.replace(/,/g, '')
      : token.replace(/\./g, '').replace(',', '.')
  }
  if (token.includes(',')) {
    const parts = token.split(',')
    return parts.length === 2 && /^[+-]?\d+$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1])
      ? token.replace(',', '.')
      : token.replace(/,/g, '')
  }
  const groups = token.split('.')
  const first = groups[0].replace(/^[+-]/, '')
  if (
    groups.length > 1 &&
    first !== '0' &&
    /^\d{1,3}$/.test(first) &&
    groups.slice(1).every((group) => /^\d{3}$/.test(group))
  ) {
    token = token.replace(/\./g, '')
  }
  return token
}

function legacyPercentageInputForControl(raw: unknown, key: string): unknown {
  if (typeof raw !== 'number' && typeof raw !== 'string') return raw
  const token = key === 'dcf_tax_rate_pct' ? String(raw).trim() : legacyPercentageToken(raw)
  if (token.length > 128 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token))
    return raw
  const ExactRate = Decimal.clone({ precision: Math.max(32, token.length + 4) })
  const amount = new ExactRate(token)
  // dcf_tax_policy.v2 explicitly consumes percentage points even below one.
  // Other adaptive readers retain the historical abs(value) < 1 fraction rule.
  const points = key !== 'dcf_tax_rate_pct' && amount.abs().lt(1) ? amount.mul(100) : amount
  const value = points.toNumber()
  return Number.isFinite(value) ? value : raw
}
