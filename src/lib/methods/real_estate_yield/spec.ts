/**
 * Real-estate yield — evidence-routed property valuation lens.
 *
 * ValuationIQ selects this standalone method when governed property evidence
 * supports a capitalised-rent approach. Venus can display an engine result but
 * does not expose a manual selector until the dedicated rent, occupancy, and
 * capitalisation-rate input surface exists.
 */

import type { MethodSpec } from '../types'

export const REAL_ESTATE_YIELD_METHOD_KEY = 'real_estate_yield' as const

export const realEstateYieldMethodSpec: MethodSpec = {
  key: REAL_ESTATE_YIELD_METHOD_KEY,
  labelKey: 'manualInput.methodSelector.realEstateYield',
  descriptionKey: 'manualInput.methodSelector.realEstateYieldDescription',
  combinable: false,
  standalone: true,
  preSelectable: false,
  bonusSections: [],
  mutuallyExclusiveWith: [],
  isAdaptive: false,
  acceptsPreparerMultipleOverride: false,
  requiresVenturePath: false,
  requiresForecastYears: false,
  requiresOwnerCompensation: false,
  appliesRealEstateCarveOut: false,
}
