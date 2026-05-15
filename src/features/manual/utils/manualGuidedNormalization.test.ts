// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { buildManualGuidedNormalizationPlan } from './manualGuidedNormalization'

describe('manualGuidedNormalization', () => {
  it('returns null when no focus field is present', () => {
    expect(buildManualGuidedNormalizationPlan({ reportId: 'r1' })).toBeNull()
    expect(
      buildManualGuidedNormalizationPlan({
        reportId: 'r1',
        guidedResolutionUrl: { focusField: '   ' },
      })
    ).toBeNull()
  })

  it('builds search hints, parsed year filters, and one-shot storage keys', () => {
    expect(
      buildManualGuidedNormalizationPlan({
        reportId: 'r1',
        guidedResolutionUrl: {
          focusField: 'owner_director_compensation',
          flagYear: '2025',
        },
      })
    ).toEqual({
      storageKey: 'venus:guided-norm-handled:r1:owner_director_compensation:2025',
      prefill: {
        initialSearchQuery: '620',
        initialYearFilter: 2025,
      },
    })
  })

  it('falls back gracefully for unknown focus fields and invalid years', () => {
    expect(
      buildManualGuidedNormalizationPlan({
        reportId: 'r1',
        guidedResolutionUrl: { focusField: 'unknown', flagYear: 'nope' },
      })
    ).toEqual({
      storageKey: 'venus:guided-norm-handled:r1:unknown:nope',
      prefill: {
        initialSearchQuery: '',
        initialYearFilter: null,
      },
    })
  })
})
