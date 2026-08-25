/** Input eligibility for the manual SDE panel.
 *
 * Venus deliberately does not estimate owner pay, select a multiple, apply a
 * haircut, or calculate value. Those are authoritative ValuationIQ decisions.
 */

export const SDE_REVENUE_CAP_EUR = 5_000_000

export type SdePreviewUnavailableReason =
  | 'missing_financials'
  | 'revenue_cap'
  | 'non_positive_ebitda'

export type SdePreviewInputs = {
  revenue: number | undefined
  ebitda: number | undefined
}

export type SdePreviewMetrics = {
  available: boolean
  unavailableReason?: SdePreviewUnavailableReason
}

function finitePositive(n: number | undefined): n is number {
  return n != null && Number.isFinite(n) && n > 0
}

export function computeSdePreviewMetrics(input: SdePreviewInputs): SdePreviewMetrics {
  const { revenue, ebitda } = input

  if (!finitePositive(revenue) || ebitda == null || !Number.isFinite(ebitda)) {
    return { available: false, unavailableReason: 'missing_financials' }
  }

  if (revenue > SDE_REVENUE_CAP_EUR) {
    return { available: false, unavailableReason: 'revenue_cap' }
  }

  if (ebitda <= 0) {
    return { available: false, unavailableReason: 'non_positive_ebitda' }
  }

  return { available: true }
}

/**
 * Section “complete” when the user entered an add-back or the financial inputs
 * are eligible for ValuationIQ to resolve the remaining SDE assumptions.
 */
export function isSdeOwnerCompensationSectionComplete(
  ownerSalaryAddback: number | undefined,
  preview: SdePreviewMetrics
): boolean {
  if (ownerSalaryAddback != null && ownerSalaryAddback > 0) return true
  return preview.available === true
}
