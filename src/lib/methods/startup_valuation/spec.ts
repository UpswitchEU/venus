/**
 * Startup Valuation — venture / pre-revenue path.
 *
 * Standalone method that routes through a dedicated `StartupAwareInputPanel`
 * (replacing the SME `ManualInputPanel`) and consumes its own qualitative
 * inputs: Berkus criteria, Scorecard weights, founder pedigree, traction
 * milestones, exit story, round simulator. Not blendable with SME methods
 * — the inputs and engine are fundamentally different shapes.
 *
 * Triggers the venture-path UI via `requiresVenturePath: true`. The
 * panel-side startup-assistant surface (benchmark fetch, studio-issue
 * filtering, assistant-rail data) lives in `useStartupAssistantSurface`.
 */

import type { MethodSpec } from '../types'

export const STARTUP_VALUATION_METHOD_KEY = 'startup_valuation' as const

export const startupValuationMethodSpec: MethodSpec = {
  key: STARTUP_VALUATION_METHOD_KEY,
  labelKey: 'manualInput.methodSelector.startupValuation',
  descriptionKey: 'manualInput.methodSelector.startupValuationDescription',
  combinable: false,
  standalone: true,
  preSelectable: true,
  bonusSections: [],
  mutuallyExclusiveWith: [],
  isAdaptive: false,
  acceptsPreparerMultipleOverride: false,
  requiresVenturePath: true,
  requiresForecastYears: false,
  requiresOwnerCompensation: false,
  appliesRealEstateCarveOut: false,
}
