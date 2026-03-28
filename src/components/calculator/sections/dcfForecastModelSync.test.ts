import { describe, expect, it } from 'vitest'
import { snapshotFromForecastRowLike, snapshotsClose } from './dcfForecastModelSync'

describe('dcfForecastModelSync', () => {
  it('treats rows as matching the model snapshot within tolerance', () => {
    const a = snapshotFromForecastRowLike({
      revenue: 1_000_000,
      ebitda: 100_000,
      capex: 30_000,
      depreciation: 30_000,
      nwc_change: 15_000,
    })
    const b = snapshotFromForecastRowLike({
      revenue: 1_000_001,
      ebitda: 100_000,
      capex: 30_000,
      depreciation: 30_000,
      nwc_change: 15_000,
    })
    expect(snapshotsClose(a, b)).toBe(true)
  })

  it('detects user overrides outside tolerance', () => {
    const model = snapshotFromForecastRowLike({
      revenue: 1_000_000,
      ebitda: 100_000,
      capex: 30_000,
      depreciation: 30_000,
      nwc_change: 15_000,
    })
    const edited = snapshotFromForecastRowLike({
      revenue: 1_050_000,
      ebitda: 100_000,
      capex: 30_000,
      depreciation: 30_000,
      nwc_change: 15_000,
    })
    expect(snapshotsClose(edited, model)).toBe(false)
  })
})
