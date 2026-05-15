/**
 * DCF (Discounted Cash Flow) — income-approach method.
 *
 * Projects 5–10 years of free cash flow, discounts at WACC, adds a terminal
 * value. Combinable with multiples / NAV in a blended valuation. Requires the
 * `dcf_projections` bonus section so the advisor can edit explicit-period
 * forecasts and WACC build-up.
 */

import type { MethodSpec } from '../types'

export const DCF_METHOD_KEY = 'dcf' as const

export const dcfMethodSpec: MethodSpec = {
  key: DCF_METHOD_KEY,
  labelKey: 'manualInput.methodSelector.dcf',
  descriptionKey: 'manualInput.methodSelector.dcfDescription',
  combinable: true,
  standalone: false,
  preSelectable: true,
  bonusSections: ['dcf_projections'],
  mutuallyExclusiveWith: [],
  isAdaptive: false,
  acceptsPreparerMultipleOverride: false,
  requiresVenturePath: false,
  requiresForecastYears: true,
  requiresOwnerCompensation: false,
  appliesRealEstateCarveOut: true,
}
