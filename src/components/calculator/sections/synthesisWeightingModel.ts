import type { ValuationMethodResult } from '@/types/valuation'
import { getValuationMethodResultForKey } from '@/utils/extractValuationResultsMap'

export interface SynthesisDcfApvBridge {
  convention: string | null
  doubleCountingGuard: string | null
  includedInDcfValue: boolean
  isCustomerTemplate: boolean
  separateWeightingMethod: boolean
  taxShield: number
  valueBeforeBridge: number | null
}

export interface SynthesisContributionRow {
  apvBridge: SynthesisDcfApvBridge | null
  available: boolean
  contribution: number | null
  equity: number | null
  label: string
  method: string
  unavailableReason: string | null
  weight: number
}

export interface SynthesisWeightingModel {
  contributionByMethod: Record<string, SynthesisContributionRow> | null
  contributions: SynthesisContributionRow[] | null
  liveBlended: number | null
}

export function formatCompactCurrency(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}€${Math.round(abs / 1_000)}K`
  return `${sign}€${Math.round(abs)}`
}

function asDetailsRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function getSynthesisDcfApvBridge(
  result: ValuationMethodResult | undefined | null
): SynthesisDcfApvBridge | null {
  const details = asDetailsRecord(result?.details)
  const taxShield = toFiniteNumber(details?.apv_tax_shield_value)
  if (taxShield == null || taxShield === 0) return null
  const provenance = asDetailsRecord(details?.apv_bridge_provenance)
  const isCustomerTemplate =
    provenance?.customer_template_reconciliation === true ||
    provenance?.benchmark_style === 'customer_template_apv'
  return {
    taxShield,
    valueBeforeBridge: toFiniteNumber(details?.dcf_equity_value_before_apv),
    isCustomerTemplate,
    includedInDcfValue: provenance?.included_in_dcf_value !== false,
    separateWeightingMethod: provenance?.separate_weighting_method === true,
    doubleCountingGuard:
      typeof provenance?.double_counting_guard === 'string'
        ? provenance.double_counting_guard
        : null,
    convention:
      typeof details?.apv_discounting_convention === 'string'
        ? details.apv_discounting_convention
        : null,
  }
}

export function buildSynthesisWeightingModel({
  displayWeights,
  methods,
  resolveLabel,
  total,
  valuationResults,
}: {
  displayWeights: Record<string, number>
  methods: string[]
  resolveLabel: (method: string) => string
  total: number
  valuationResults?: Record<string, ValuationMethodResult> | null
}): SynthesisWeightingModel {
  // `total` remains in the input contract while callers migrate. Venus may
  // validate weights, but it never turns them into a monetary contribution.
  void total
  const hasResults = !!valuationResults && Object.keys(valuationResults).length > 0
  if (!hasResults) {
    return {
      contributionByMethod: null,
      contributions: null,
      liveBlended: null,
    }
  }

  const contributions = methods.map((method) => {
    const result = getValuationMethodResultForKey(valuationResults, method)
    const weight = displayWeights[method] ?? 0
    const rawEquity = result?.available && result.value != null ? Number(result.value) : NaN
    const equity = Number.isFinite(rawEquity) ? rawEquity : null
    const apvBridge = method === 'dcf' ? getSynthesisDcfApvBridge(result) : null
    return {
      method,
      label: resolveLabel(method),
      equity,
      weight,
      contribution: null,
      available: result?.available ?? false,
      unavailableReason: result?.unavailable_reason ?? null,
      apvBridge,
    }
  })

  const contributionByMethod: Record<string, SynthesisContributionRow> = {}
  for (const contribution of contributions) {
    contributionByMethod[contribution.method] = contribution
  }

  return {
    contributionByMethod,
    contributions,
    liveBlended: null,
  }
}
