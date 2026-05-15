// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { getManualOriginalEbitdaForDisplay } from './manualOriginalEbitdaDisplay'

describe('manualOriginalEbitdaDisplay', () => {
  it('prefers the year-specific reported EBITDA baseline', () => {
    expect(
      getManualOriginalEbitdaForDisplay({
        year: 2025,
        originalEBITDAByYear: { 2025: 125_000 },
        formCurrentEbitda: 100_000,
      })
    ).toBe(125_000)
  })

  it('falls back through form, latest form, result metadata, result, and report values', () => {
    expect(
      getManualOriginalEbitdaForDisplay({
        year: 2025,
        originalEBITDAByYear: {},
        latestFormData: { current_year_data: { ebitda: 110_000 }, ebitda: 105_000 },
      })
    ).toBe(110_000)

    expect(
      getManualOriginalEbitdaForDisplay({
        year: 2025,
        originalEBITDAByYear: {},
        result: {
          current_year_data: {
            ebitda_normalization_metadata: { reported_ebitda: 95_000 },
          },
        },
      })
    ).toBe(95_000)

    expect(
      getManualOriginalEbitdaForDisplay({
        year: 2025,
        originalEBITDAByYear: {},
        report: { reported_ebitda: 90_000 },
      })
    ).toBe(90_000)
  })

  it('returns zero when no finite fallback exists', () => {
    expect(
      getManualOriginalEbitdaForDisplay({
        year: 2025,
        originalEBITDAByYear: {},
        result: { reported_ebitda: 'nope' },
      })
    ).toBe(0)
  })
})
