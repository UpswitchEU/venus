/**
 * ARR Multiple — SaaS-specific market-approach method.
 *
 * Applies an EV/ARR multiple to annual recurring revenue. The canonical
 * SaaS pricing lens: traction is measured by recurring revenue quality
 * (churn, NRR, gross margin) rather than EBITDA. Triggers the
 * `saas_metrics` bonus section so the founder/advisor can capture the
 * cohort, churn, and ARR-quality signals the engine needs.
 *
 * Combinable — a SaaS valuation often blends EV/ARR (forward-looking,
 * growth-weighted) with EV/EBITDA (profitability-weighted) for mature
 * SaaS companies. No mutual exclusions.
 */

import type { MethodSpec } from '../types'

export const ARR_MULTIPLE_METHOD_KEY = 'arr_multiple' as const

export const arrMultipleMethodSpec: MethodSpec = {
  key: ARR_MULTIPLE_METHOD_KEY,
  labelKey: 'manualInput.methodSelector.arrMultiple',
  descriptionKey: 'manualInput.methodSelector.arrMultipleDescription',
  combinable: true,
  standalone: false,
  preSelectable: true,
  bonusSections: ['saas_metrics'],
  mutuallyExclusiveWith: [],
  isAdaptive: false,
  acceptsPreparerMultipleOverride: false,
  requiresVenturePath: false,
  requiresForecastYears: false,
  requiresOwnerCompensation: false,
  appliesRealEstateCarveOut: false,
}
