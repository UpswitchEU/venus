import { describe, expect, it } from 'vitest'
import { buildQualityWarningResetKey } from './qualityWarningResetKey'

describe('buildQualityWarningResetKey', () => {
  it('changes when updated_at changes for same valuation_id', () => {
    const a = buildQualityWarningResetKey({
      valuation_id: 'same-id',
      updated_at: '2026-05-06T11:00:00Z',
      data_quality_warnings: [{ type: 'net_debt_unavailable', severity: 'high' }],
    })
    const b = buildQualityWarningResetKey({
      valuation_id: 'same-id',
      updated_at: '2026-05-06T11:05:00Z',
      data_quality_warnings: [{ type: 'net_debt_unavailable', severity: 'high' }],
    })
    expect(a).not.toBe(b)
  })

  it('changes when high-severity warning content changes', () => {
    const a = buildQualityWarningResetKey({
      valuation_id: 'same-id',
      data_quality_warnings: [
        { type: 'ebitda_benchmark_deviation', severity: 'high', message: 'm1' },
      ],
    })
    const b = buildQualityWarningResetKey({
      valuation_id: 'same-id',
      data_quality_warnings: [
        { type: 'ebitda_benchmark_deviation', severity: 'high', message: 'm2' },
      ],
    })
    expect(a).not.toBe(b)
  })

  it('ignores non-high warnings for reset signature', () => {
    const a = buildQualityWarningResetKey({
      valuation_id: 'same-id',
      data_quality_warnings: [{ type: 'thin_comparables_proxy', severity: 'medium' }],
    })
    const b = buildQualityWarningResetKey({
      valuation_id: 'same-id',
      data_quality_warnings: [{ type: 'thin_comparables_proxy', severity: 'low' }],
    })
    expect(a).toBe(b)
  })
})
