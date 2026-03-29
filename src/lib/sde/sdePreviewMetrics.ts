/**
 * Pure preview math for the manual SDE panel — mirrors ValuationIQ
 * `omni_calc_coordinator._calculate_sde_method` (SDE line, base multiple, implied EV).
 * Equity / adjustments / debt are applied server-side; EV here is SDE × multiple only.
 * SSR-safe: no browser-only APIs.
 */

export const SDE_REVENUE_CAP_EUR = 5_000_000
export const OWNER_SALARY_ESTIMATE_PCT = 0.15
export const OWNER_SALARY_ESTIMATE_CAP_EUR = 120_000

export type SdePreviewUnavailableReason =
  | 'missing_financials'
  | 'revenue_cap'
  | 'non_positive_ebitda'

export type SdePreviewInputs = {
  revenue: number | undefined
  ebitda: number | undefined
  ownerSalaryAddback?: number
  /** 0–100, optional; matches engine owner-dependency multiple haircut. */
  ownerDependencyScore?: number
}

export type SdePreviewMetrics = {
  available: boolean
  unavailableReason?: SdePreviewUnavailableReason
  ownerSalaryEstimate: number | null
  actualAddback: number | null
  addbackSource: 'input' | 'estimate' | null
  sde: number | null
  baseSdeMultiple: number | null
  adjustedSdeMultiple: number | null
  impliedEnterpriseValue: number | null
}

function finitePositive(n: number | undefined): n is number {
  return n != null && Number.isFinite(n) && n > 0
}

/**
 * Revenue-based owner salary benchmark when no explicit add-back is provided (engine parity).
 */
export function computeOwnerSalaryEstimate(revenue: number): number {
  if (!Number.isFinite(revenue) || revenue <= 0) return 0
  return Math.min(revenue * OWNER_SALARY_ESTIMATE_PCT, OWNER_SALARY_ESTIMATE_CAP_EUR)
}

export function resolveActualOwnerAddback(
  ownerSalaryAddback: number | undefined,
  revenue: number
): { addback: number; source: 'input' | 'estimate' } {
  if (ownerSalaryAddback != null && ownerSalaryAddback > 0) {
    return { addback: ownerSalaryAddback, source: 'input' }
  }
  return { addback: computeOwnerSalaryEstimate(revenue), source: 'estimate' }
}

/** Base SDE multiple band by revenue (before owner-dependency haircut). */
export function selectBaseSdeMultiple(revenue: number): number {
  if (revenue < 500_000) return 1.5
  if (revenue < 2_000_000) return 2.0
  return 2.75
}

export function applyOwnerDependencyToSdeMultiple(
  multiple: number,
  overallDependencyScore: number | undefined
): number {
  if (overallDependencyScore == null || !Number.isFinite(overallDependencyScore)) {
    return multiple
  }
  if (overallDependencyScore >= 70) return multiple * 0.85
  if (overallDependencyScore >= 50) return multiple * 0.92
  return multiple
}

export function computeSdePreviewMetrics(input: SdePreviewInputs): SdePreviewMetrics {
  const { revenue, ebitda, ownerSalaryAddback, ownerDependencyScore } = input

  const nullBase: Omit<SdePreviewMetrics, 'available'> = {
    ownerSalaryEstimate: null,
    actualAddback: null,
    addbackSource: null,
    sde: null,
    baseSdeMultiple: null,
    adjustedSdeMultiple: null,
    impliedEnterpriseValue: null,
  }

  if (!finitePositive(revenue) || !Number.isFinite(ebitda)) {
    return { available: false, unavailableReason: 'missing_financials', ...nullBase }
  }

  if (revenue > SDE_REVENUE_CAP_EUR) {
    return { available: false, unavailableReason: 'revenue_cap', ...nullBase }
  }

  if (ebitda <= 0) {
    return { available: false, unavailableReason: 'non_positive_ebitda', ...nullBase }
  }

  const ownerSalaryEstimate = computeOwnerSalaryEstimate(revenue)
  const { addback, source } = resolveActualOwnerAddback(ownerSalaryAddback, revenue)
  const sde = ebitda + addback
  const baseSdeMultiple = selectBaseSdeMultiple(revenue)
  const adjustedSdeMultiple = applyOwnerDependencyToSdeMultiple(
    baseSdeMultiple,
    ownerDependencyScore
  )
  const impliedEnterpriseValue = sde * adjustedSdeMultiple

  return {
    available: true,
    ownerSalaryEstimate,
    actualAddback: addback,
    addbackSource: source,
    sde,
    baseSdeMultiple,
    adjustedSdeMultiple,
    impliedEnterpriseValue,
  }
}

/**
 * Section “complete” when the user entered an add-back or omni-calc can derive SDE from history.
 */
export function isSdeOwnerCompensationSectionComplete(
  ownerSalaryAddback: number | undefined,
  preview: SdePreviewMetrics
): boolean {
  if (ownerSalaryAddback != null && ownerSalaryAddback > 0) return true
  return preview.available === true
}
