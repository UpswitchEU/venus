/**
 * EBITDA Multiple — market-approach method.
 *
 * Applies a sector × country EV/EBITDA multiple (sourced from Delphi) to
 * normalised EBITDA. The canonical combinable market method for SME deals.
 * Mutually exclusive with `sde_multiple` (different owner-compensation base —
 * blending them double-counts the same earnings stream).
 */

import type { MethodSpec } from '../types'

export const EBITDA_MULTIPLE_METHOD_KEY = 'ebitda_multiple' as const

export const ebitdaMultipleMethodSpec: MethodSpec = {
  key: EBITDA_MULTIPLE_METHOD_KEY,
  labelKey: 'manualInput.methodSelector.ebitdaMultiple',
  descriptionKey: 'manualInput.methodSelector.ebitdaMultipleDescription',
  combinable: true,
  standalone: false,
  preSelectable: true,
  bonusSections: ['revenue_quality'],
  mutuallyExclusiveWith: ['sde_multiple'],
  isAdaptive: false,
  acceptsPreparerMultipleOverride: true,
  requiresVenturePath: false,
  requiresForecastYears: false,
  requiresOwnerCompensation: false,
  appliesRealEstateCarveOut: true,
}
