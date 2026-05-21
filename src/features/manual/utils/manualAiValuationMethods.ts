import { getMethodSpec } from '@/lib/methods'

const AI_METHOD_ALIASES: Record<string, string> = {
  adaptive: 'upswitch_adaptive',
  upswitch_adaptive: 'upswitch_adaptive',
  ebitda: 'ebitda_multiple',
  ebitda_multiple: 'ebitda_multiple',
  multiple: 'ebitda_multiple',
  multiples: 'ebitda_multiple',
  omzet: 'omzet_multiple',
  omzet_multiple: 'omzet_multiple',
  sales: 'omzet_multiple',
  turnover: 'omzet_multiple',
  revenue: 'revenue_multiple',
  revenue_multiple: 'revenue_multiple',
  dcf: 'dcf',
  discounted_cash_flow: 'dcf',
  sde: 'sde_multiple',
  sde_multiple: 'sde_multiple',
  arr: 'arr_multiple',
  arr_multiple: 'arr_multiple',
  saas: 'arr_multiple',
  nav: 'adjusted_nav',
  adjusted_nav: 'adjusted_nav',
  asset_based: 'adjusted_nav',
  asset_based_value: 'adjusted_nav',
  fiscal: 'fiscal_4x',
  fiscal_4x: 'fiscal_4x',
  fiscal_reference: 'fiscal_4x',
  capital_gains_tax: 'fiscal_4x',
  startup: 'startup_valuation',
  startup_valuation: 'startup_valuation',
  venture: 'startup_valuation',
  venture_valuation: 'startup_valuation',
  liquidation: 'liquidation_analysis',
  liquidation_analysis: 'liquidation_analysis',
  liquidation_value: 'liquidation_analysis',
  orderly_liquidation: 'liquidation_analysis',
  forced_liquidation: 'liquidation_analysis',
}

function normalizeAgentMethodToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (!key) return null
  return AI_METHOD_ALIASES[key] ?? (getMethodSpec(key) ? key : null)
}

export function canonicalAgentMethodSelection(methods?: readonly unknown[] | null): string[] {
  if (!Array.isArray(methods)) return []

  const seen = new Set<string>()
  const canonical: string[] = []

  for (const raw of methods) {
    const method = normalizeAgentMethodToken(raw)
    if (!method || seen.has(method) || !getMethodSpec(method)) continue
    seen.add(method)
    canonical.push(method)
  }

  return canonical
}
