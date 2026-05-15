/**
 * Omzet (Revenue) Multiple — NL-keyed market-approach method.
 *
 * Applies a sector × country EV/Revenue multiple to last-twelve-months
 * revenue. The NL-canonical key (Belgian/Dutch advisors); `revenue_multiple`
 * is the EN-aliased sibling for cross-app payloads.
 *
 * Mutually exclusive with `revenue_multiple` (same economics, different
 * key — must not appear together in a blend).
 */

import type { MethodSpec } from '../types'

export const OMZET_MULTIPLE_METHOD_KEY = 'omzet_multiple' as const

export const omzetMultipleMethodSpec: MethodSpec = {
  key: OMZET_MULTIPLE_METHOD_KEY,
  labelKey: 'manualInput.methodSelector.revenueMultiple',
  descriptionKey: 'manualInput.methodSelector.revenueMultipleDescription',
  combinable: true,
  standalone: false,
  preSelectable: true,
  bonusSections: ['revenue_quality'],
  mutuallyExclusiveWith: ['revenue_multiple'],
  isAdaptive: false,
  acceptsPreparerMultipleOverride: false,
  requiresVenturePath: false,
  requiresForecastYears: false,
  requiresOwnerCompensation: false,
  appliesRealEstateCarveOut: false,
}
