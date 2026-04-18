import { describe, expect, it } from 'vitest'
import {
  LEGACY_STANDALONE_REPORT_READY_HASH,
  resolveStandaloneReportReadyHash,
  STANDALONE_REPORT_READY_HASH,
} from '../standaloneReportReadyHash'

/**
 * Regression tests for the standalone-report ready-hash policy.
 *
 * The single hard requirement protected here is: the user-visible URL must
 * NEVER contain the internal codename `venus`. Anything that would surface
 * `#venus-ready` on a freshly-loaded report is a regression.
 */
describe('resolveStandaloneReportReadyHash', () => {
  it('exposes the neutral `#ready` hash as the canonical value', () => {
    expect(STANDALONE_REPORT_READY_HASH).toBe('#ready')
  })

  it('still knows about the legacy `#venus-ready` hash for back-compat reads', () => {
    expect(LEGACY_STANDALONE_REPORT_READY_HASH).toBe('#venus-ready')
  })

  it('writes `#ready` (NOT `#venus-ready`) on a fresh report load with no hash', () => {
    const result = resolveStandaloneReportReadyHash({
      pathname: '/en/reports/r_123abc',
      search: '?source=mercury',
      hash: '',
    })
    expect(result.shouldReplace).toBe(true)
    expect(result.nextUrl).toBe('/en/reports/r_123abc?source=mercury#ready')
    expect(result.nextUrl).not.toContain('venus')
  })

  it('preserves the existing pathname and full search string verbatim', () => {
    const result = resolveStandaloneReportReadyHash({
      pathname: '/nl/reports/r_zyx',
      search:
        '?source=mercury&prefilledQuery=Acme%20BV&selected_method=upswitch_adaptive&drawer=trust',
      hash: '',
    })
    expect(result.shouldReplace).toBe(true)
    expect(result.nextUrl).toBe(
      '/nl/reports/r_zyx?source=mercury&prefilledQuery=Acme%20BV&selected_method=upswitch_adaptive&drawer=trust#ready'
    )
  })

  it('is a no-op when `#ready` is already present (avoids redundant replaceState)', () => {
    const result = resolveStandaloneReportReadyHash({
      pathname: '/en/reports/r_123abc',
      search: '',
      hash: '#ready',
    })
    expect(result.shouldReplace).toBe(false)
  })

  it('is a no-op when the legacy `#venus-ready` is present (in-flight tab tolerance)', () => {
    const result = resolveStandaloneReportReadyHash({
      pathname: '/en/reports/r_123abc',
      search: '',
      hash: '#venus-ready',
    })
    expect(result.shouldReplace).toBe(false)
  })

  it('overrides any other unrelated hash with `#ready` on next render', () => {
    const result = resolveStandaloneReportReadyHash({
      pathname: '/en/reports/r_123abc',
      search: '?source=mercury',
      hash: '#section-ev-bridge',
    })
    expect(result.shouldReplace).toBe(true)
    expect(result.nextUrl).toBe('/en/reports/r_123abc?source=mercury#ready')
  })

  it('handles an empty pathname and search defensively', () => {
    const result = resolveStandaloneReportReadyHash({
      pathname: '',
      search: '',
      hash: '',
    })
    expect(result.shouldReplace).toBe(true)
    expect(result.nextUrl).toBe('#ready')
  })
})
