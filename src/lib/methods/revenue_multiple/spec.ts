/**
 * Revenue Multiple — EN-keyed alias of `omzet_multiple`.
 *
 * Same economics as the NL-canonical `omzet_multiple`, surfaced under the
 * English key for cross-app payload compatibility (ValuationIQ + some
 * BFF paths emit this form). NOT shown in the top-bar dropdown
 * (`preSelectable: false`) — the NL key is the user-facing surface; this
 * key only appears in API responses and weight tables that travel through
 * `revenueMethodologySiblingKey` aliasing.
 *
 * Mutually exclusive with `omzet_multiple` (must not appear together —
 * `methodFieldConfig.MUTUALLY_EXCLUSIVE_PAIRS` enforces this when a
 * selection arrives from a non-UI source).
 */

import type { MethodSpec } from '../types'

export const REVENUE_MULTIPLE_METHOD_KEY = 'revenue_multiple' as const

export const revenueMultipleMethodSpec: MethodSpec = {
  key: REVENUE_MULTIPLE_METHOD_KEY,
  labelKey: 'manualInput.methodSelector.revenueMultiple',
  descriptionKey: 'manualInput.methodSelector.revenueMultipleDescription',
  combinable: true,
  standalone: false,
  preSelectable: false,
  bonusSections: ['revenue_quality'],
  mutuallyExclusiveWith: ['omzet_multiple'],
  isAdaptive: false,
  acceptsPreparerMultipleOverride: false,
  requiresVenturePath: false,
  requiresForecastYears: false,
  requiresOwnerCompensation: false,
  appliesRealEstateCarveOut: false,
}
