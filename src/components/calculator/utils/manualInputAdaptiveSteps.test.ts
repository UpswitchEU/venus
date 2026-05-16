import { describe, expect, it } from 'vitest'
import {
  buildManualInputAdaptiveHeaderSteps,
  getManualInputBalanceSheetCarveOutStep,
  getManualInputSynthesisStep,
} from './manualInputAdaptiveSteps'

describe('manual input adaptive steps', () => {
  it('reserves DCF forecast slots before method-specific bonus sections', () => {
    const steps = buildManualInputAdaptiveHeaderSteps({
      effectiveMethod: 'dcf',
      effectiveMethods: ['dcf', 'adjusted_nav'],
      hasDcfForecastWorkspace: true,
      resolvedBusinessCategory: 'saas_software',
      resolvedBusinessTypeId: 'saas',
      saasSignals: {},
    })

    expect(steps).toEqual({
      dcfGlobal: 4,
      nav: 8,
      saas: 9,
    })
    expect(getManualInputBalanceSheetCarveOutStep(true)).toBe(7)
    expect(getManualInputSynthesisStep(7, steps)).toBe(10)
  })

  it('keeps carve-out as step 4 when no DCF forecast workspace is present', () => {
    const steps = buildManualInputAdaptiveHeaderSteps({
      effectiveMethod: 'arr_multiple',
      effectiveMethods: ['arr_multiple'],
      hasDcfForecastWorkspace: false,
      resolvedBusinessCategory: 'saas_software',
      resolvedBusinessTypeId: 'saas',
      saasSignals: {},
    })

    expect(steps).toEqual({ saas: 5 })
    expect(getManualInputBalanceSheetCarveOutStep(false)).toBe(4)
    expect(getManualInputSynthesisStep(4, steps)).toBe(6)
  })
})
