/**
 * Liquidation Analysis — orderly + forced wind-down with IVS 104 premise of
 * value, Altman Z'' distress probability, 12-class realisation schedule,
 * BE/NL insolvency priority cascade and tax leakage. The downside lens; not
 * blendable with going-concern multiples (different premise of value,
 * IVS 104 §80).
 *
 * Phase 1-4+ depth (Big-4-grade) lives engine-side in `liquidation/`.
 * The method module owns the Venus stack wrapper and prefill-source
 * derivation; the heavyweight visual input section still lives in
 * `components/calculator/sections/` until it gets its own decomposition pass.
 */

import type { MethodSpec } from '../types'

export const LIQUIDATION_ANALYSIS_METHOD_KEY = 'liquidation_analysis' as const

export const liquidationAnalysisMethodSpec: MethodSpec = {
  key: LIQUIDATION_ANALYSIS_METHOD_KEY,
  labelKey: 'manualInput.methodSelector.liquidationAnalysis',
  descriptionKey: 'manualInput.methodSelector.liquidationAnalysisDescription',
  combinable: false,
  standalone: true,
  preSelectable: true,
  bonusSections: ['nav_asset_schedule', 'liquidation_inputs'],
  mutuallyExclusiveWith: [],
  isAdaptive: false,
  acceptsPreparerMultipleOverride: false,
  requiresVenturePath: false,
  requiresForecastYears: false,
  requiresOwnerCompensation: false,
  appliesRealEstateCarveOut: false,
}
