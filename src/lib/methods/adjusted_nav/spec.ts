/**
 * Adjusted NAV — asset-approach method.
 *
 * Reprices the balance sheet to fair market value (real estate, inventory,
 * receivables, intangibles) to surface the equity floor. Combinable with
 * multiples / DCF for accountants who want to blend the asset floor with a
 * going-concern lens. Mutually exclusive with `sde_multiple` (SDE excludes
 * balance-sheet-driven valuations — they answer different questions).
 */

import type { MethodSpec } from '../types'

export const ADJUSTED_NAV_METHOD_KEY = 'adjusted_nav' as const

export const adjustedNavMethodSpec: MethodSpec = {
  key: ADJUSTED_NAV_METHOD_KEY,
  labelKey: 'manualInput.methodSelector.adjustedNav',
  descriptionKey: 'manualInput.methodSelector.adjustedNavDescription',
  combinable: true,
  standalone: false,
  preSelectable: true,
  bonusSections: ['nav_asset_schedule'],
  mutuallyExclusiveWith: ['sde_multiple'],
  isAdaptive: false,
  acceptsPreparerMultipleOverride: false,
  requiresVenturePath: false,
  requiresForecastYears: false,
  requiresOwnerCompensation: false,
  // NAV has its own dedicated real-estate appraisal section; the EBITDA
  // carve-out toggle would conflict with that workflow.
  appliesRealEstateCarveOut: false,
}
