// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { buildManualGuidedNormalizationPlan } from './manualGuidedNormalization'

describe('manualGuidedNormalization', () => {
  it('returns null when no focus field is present', () => {
    expect(buildManualGuidedNormalizationPlan({})).toBeNull()
    expect(
      buildManualGuidedNormalizationPlan({
        guidedResolutionUrl: { focusField: '   ' },
      })
    ).toBeNull()
  })

  it('builds search hints and parsed year filters', () => {
    expect(
      buildManualGuidedNormalizationPlan({
        guidedResolutionUrl: {
          focusField: 'owner_director_compensation',
          flagYear: '2025',
        },
      })
    ).toEqual({
      prefill: {
        initialSearchQuery: '620',
        initialYearFilter: 2025,
      },
    })
  })

  it('falls back gracefully for unknown focus fields and invalid years', () => {
    expect(
      buildManualGuidedNormalizationPlan({
        guidedResolutionUrl: { focusField: 'unknown', flagYear: 'nope' },
      })
    ).toEqual({
      prefill: {
        initialSearchQuery: '',
        initialYearFilter: null,
      },
    })
  })
})
