import { describe, expect, it } from 'vitest'

import { getDataQualityWarningsFromResult } from './dataQualityWarnings'

describe('getDataQualityWarningsFromResult', () => {
  it('returns empty for invalid payloads', () => {
    expect(getDataQualityWarningsFromResult(null)).toEqual([])
    expect(getDataQualityWarningsFromResult([])).toEqual([])
    expect(getDataQualityWarningsFromResult(undefined)).toEqual([])
    expect(getDataQualityWarningsFromResult('x')).toEqual([])
  })

  it('filters to object rows only', () => {
    expect(
      getDataQualityWarningsFromResult({
        data_quality_warnings: [{ type: 'x' }, null, 'bad', { type: 'y' }],
      })
    ).toEqual([{ type: 'x' }, { type: 'y' }])
  })

  it('returns empty when field missing or not array', () => {
    expect(getDataQualityWarningsFromResult({})).toEqual([])
    expect(getDataQualityWarningsFromResult({ data_quality_warnings: 'nope' })).toEqual([])
    expect(getDataQualityWarningsFromResult({ data_quality_warnings: {} })).toEqual([])
  })

  it('returns warnings array when present at top level', () => {
    const w = [{ type: 'ebitda_divergence', severity: 'high' }]
    expect(getDataQualityWarningsFromResult({ data_quality_warnings: w })).toEqual(w)
  })

  it('falls back to details when top-level key is absent', () => {
    expect(
      getDataQualityWarningsFromResult({
        details: { data_quality_warnings: [{ type: 'nested-only' }] },
      })
    ).toEqual([{ type: 'nested-only' }])
  })

  it('falls back to details.data_quality_warnings when top-level is empty', () => {
    expect(
      getDataQualityWarningsFromResult({
        data_quality_warnings: [],
        details: { data_quality_warnings: [{ type: 'x', severity: 'high' }] },
      })
    ).toEqual([{ type: 'x', severity: 'high' }])
  })

  it('falls back to valuation_result.data_quality_warnings when higher slots are empty', () => {
    expect(
      getDataQualityWarningsFromResult({
        valuation_result: { data_quality_warnings: [{ type: 'step-nested', severity: 'low' }] },
      })
    ).toEqual([{ type: 'step-nested', severity: 'low' }])
  })

  it('prefers top-level warnings over details when both exist', () => {
    expect(
      getDataQualityWarningsFromResult({
        data_quality_warnings: [{ type: 'top' }],
        details: { data_quality_warnings: [{ type: 'nested' }] },
      })
    ).toEqual([{ type: 'top' }])
  })

  it('prefers details.data_quality_warnings over root valuation_result', () => {
    expect(
      getDataQualityWarningsFromResult({
        data_quality_warnings: [],
        details: { data_quality_warnings: [{ type: 'from-details' }] },
        valuation_result: { data_quality_warnings: [{ type: 'from-vr' }] },
      })
    ).toEqual([{ type: 'from-details' }])
  })

  it('reads warnings from details.valuation_result when earlier slots are empty', () => {
    expect(
      getDataQualityWarningsFromResult({
        data_quality_warnings: [],
        details: {
          data_quality_warnings: [],
          valuation_result: { data_quality_warnings: [{ type: 'inner' }] },
        },
      })
    ).toEqual([{ type: 'inner' }])
  })
})
