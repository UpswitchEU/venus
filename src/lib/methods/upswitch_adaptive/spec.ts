/**
 * Upswitch Adaptive — the engine-default umbrella method.
 *
 * The "no specific method chosen" sentinel. When this is the selected
 * method, the engine derives the headline valuation from all eligible
 * methods + the multiples band, weighted by a proprietary algorithm.
 * Standalone because the adaptive blend already incorporates every other
 * method's output — re-blending would double-count.
 *
 * Carries two capability flags:
 *   - `isAdaptive: true` — the store represents this as `preSelectedMethod = null`
 *   - `acceptsPreparerMultipleOverride: true` — adaptive uses an EBITDA
 *     multiple under the hood, so the preparer override applies
 */

import type { MethodSpec } from '../types'

export const UPSWITCH_ADAPTIVE_METHOD_KEY = 'upswitch_adaptive' as const

export const upswitchAdaptiveMethodSpec: MethodSpec = {
  key: UPSWITCH_ADAPTIVE_METHOD_KEY,
  labelKey: 'manualInput.methodSelector.adaptiveRecommended',
  descriptionKey: 'manualInput.methodSelector.adaptiveDescription',
  combinable: false,
  standalone: true,
  preSelectable: true,
  bonusSections: [],
  mutuallyExclusiveWith: [],
  isAdaptive: true,
  acceptsPreparerMultipleOverride: true,
  requiresVenturePath: false,
  requiresForecastYears: false,
  requiresOwnerCompensation: false,
  appliesRealEstateCarveOut: true,
}
