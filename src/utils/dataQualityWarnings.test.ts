import { describe, expect, it } from 'vitest'

import { getDataQualityWarningsFromResult } from './dataQualityWarnings'

describe('getDataQualityWarningsFromResult', () => {
  it('returns empty array for nullish or non-object', () => {
    expect(getDataQualityWarningsFromResult(null)).toEqual([])
    expect(getDataQualityWarningsFromResult(undefined)).toEqual([])
    expect(getDataQualityWarningsFromResult('x')).toEqual([])
  })

  it('returns empty when data_quality_warnings is not an array', () => {
    expect(getDataQualityWarningsFromResult({ data_quality_warnings: {} })).toEqual([])
  })

  it('returns warnings array when present', () => {
    const w = [{ type: 'ebitda_divergence', severity: 'high' }]
    expect(getDataQualityWarningsFromResult({ data_quality_warnings: w })).toEqual(w)
  })
})
