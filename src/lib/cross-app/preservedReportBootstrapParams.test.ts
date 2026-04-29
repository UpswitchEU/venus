import { describe, expect, it } from 'vitest'
import { buildPreservedReportBootstrapQueryString } from './preservedReportBootstrapParams'

describe('buildPreservedReportBootstrapQueryString', () => {
  it('keeps only non-empty allowlisted keys in array order', () => {
    const q = buildPreservedReportBootstrapQueryString({
      clientId: 'c1',
      session_key: 'val_x',
      source: 'mercury',
      utm_source: 'drop-me',
    })
    expect(q).toBe(
      '?clientId=c1&session_key=val_x&source=mercury',
    )
  })

  it('preserves benchmark_contribution=0 (opt-out)', () => {
    expect(buildPreservedReportBootstrapQueryString({ benchmark_contribution: '0' })).toBe(
      '?benchmark_contribution=0',
    )
  })

  it('preserves waarderen studio=legacy with flow=startup', () => {
    const q = buildPreservedReportBootstrapQueryString({
      flow: 'startup',
      studio: 'legacy',
    })
    expect(q).toBe('?flow=startup&studio=legacy')
  })
})
