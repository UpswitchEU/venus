/**
 * Seller's Discretionary Earnings (SDE) Multiple — market-approach method for
 * owner-operated SMEs.
 *
 * Applies a sector × country EV/SDE multiple to normalised owner earnings
 * (EBITDA + owner compensation add-back). Mutually exclusive with
 * `ebitda_multiple` (different owner-compensation base — blending would
 * double-count the same earnings stream) and `adjusted_nav` (SDE excludes
 * balance-sheet-driven valuations).
 *
 * Domain math utilities (`computeSdeOwnerSalaryPrefill`, `sdePreviewMetrics`)
 * live in `@/lib/sde/` — this module owns the spec + the panel-side
 * `useSdeOwnerCompensationPrefill` hook that coordinates the prefill ref.
 */

import type { MethodSpec } from '../types'

export const SDE_MULTIPLE_METHOD_KEY = 'sde_multiple' as const

export const sdeMultipleMethodSpec: MethodSpec = {
  key: SDE_MULTIPLE_METHOD_KEY,
  labelKey: 'manualInput.methodSelector.sdeMultiple',
  descriptionKey: 'manualInput.methodSelector.sdeMultipleDescription',
  combinable: true,
  standalone: false,
  preSelectable: true,
  bonusSections: ['sde_owner_compensation'],
  mutuallyExclusiveWith: ['ebitda_multiple', 'adjusted_nav'],
  isAdaptive: false,
  acceptsPreparerMultipleOverride: false,
  requiresVenturePath: false,
  requiresForecastYears: false,
  requiresOwnerCompensation: true,
  appliesRealEstateCarveOut: true,
}
