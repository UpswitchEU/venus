import { describe, expect, it } from 'vitest'
import { LIQUIDATION_ANALYSIS_METHOD_KEY, liquidationAnalysisMethodSpec } from './spec'

describe('liquidationAnalysisMethodSpec', () => {
  it('uses the canonical "liquidation_analysis" key', () => {
    expect(LIQUIDATION_ANALYSIS_METHOD_KEY).toBe('liquidation_analysis')
    expect(liquidationAnalysisMethodSpec.key).toBe('liquidation_analysis')
  })

  it('is standalone, not combinable (different premise of value per IVS 104 §80)', () => {
    expect(liquidationAnalysisMethodSpec.combinable).toBe(false)
    expect(liquidationAnalysisMethodSpec.standalone).toBe(true)
  })

  it('is pre-selectable in the top-bar dropdown', () => {
    expect(liquidationAnalysisMethodSpec.preSelectable).toBe(true)
  })

  it('reuses nav_asset_schedule and adds liquidation_inputs as bonus sections', () => {
    expect(liquidationAnalysisMethodSpec.bonusSections).toEqual([
      'nav_asset_schedule',
      'liquidation_inputs',
    ])
  })

  it('declares no mutual exclusions (standalone covers it)', () => {
    expect(liquidationAnalysisMethodSpec.mutuallyExclusiveWith).toEqual([])
  })

  it('declares matching label + description i18n keys', () => {
    expect(liquidationAnalysisMethodSpec.labelKey).toBe(
      'manualInput.methodSelector.liquidationAnalysis'
    )
    expect(liquidationAnalysisMethodSpec.descriptionKey).toBe(
      'manualInput.methodSelector.liquidationAnalysisDescription'
    )
  })

  it('opts into no method-specific UI capability (own dedicated section is rendered via bonusSections)', () => {
    expect(liquidationAnalysisMethodSpec.isAdaptive).toBe(false)
    expect(liquidationAnalysisMethodSpec.acceptsPreparerMultipleOverride).toBe(false)
    expect(liquidationAnalysisMethodSpec.requiresVenturePath).toBe(false)
    expect(liquidationAnalysisMethodSpec.requiresForecastYears).toBe(false)
    expect(liquidationAnalysisMethodSpec.requiresOwnerCompensation).toBe(false)
  })
})
