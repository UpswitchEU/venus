import { describe, expect, it } from 'vitest'
import {
  safeVenusInternalPath,
  safeVenusSameOriginNavigationTarget,
  venusRedirectOriginFromOrigin,
} from './safeVenusRedirect'

describe('safeVenusInternalPath', () => {
  it('accepts internal paths with query and hash', () => {
    expect(safeVenusInternalPath('/nl/reports/new?source=mercury#ready')).toBe(
      '/nl/reports/new?source=mercury#ready'
    )
  })

  it('rejects protocol-relative and browser-normalized authority paths', () => {
    expect(safeVenusInternalPath('//evil.example/phish')).toBeNull()
    expect(safeVenusInternalPath('/\\evil.example/phish')).toBeNull()
  })
})

describe('safeVenusSameOriginNavigationTarget', () => {
  it('accepts same-origin path and absolute URL targets', () => {
    expect(
      safeVenusSameOriginNavigationTarget('/nl/reports/new', 'https://valuation.upswitch.app')
    ).toBe('/nl/reports/new')
    expect(
      safeVenusSameOriginNavigationTarget(
        'https://valuation.upswitch.app/nl/reports/new?x=1',
        'https://valuation.upswitch.app'
      )
    ).toBe('https://valuation.upswitch.app/nl/reports/new?x=1')
  })

  it('rejects cross-origin and browser-normalized authority targets', () => {
    expect(
      safeVenusSameOriginNavigationTarget(
        'https://evil.example/nl/reports/new',
        'https://valuation.upswitch.app'
      )
    ).toBeNull()
    expect(
      safeVenusSameOriginNavigationTarget('/\\evil.example/phish', 'https://valuation.upswitch.app')
    ).toBeNull()
  })
})

describe('venusRedirectOriginFromOrigin', () => {
  it('falls back to the canonical origin for untrusted request origins', () => {
    expect(venusRedirectOriginFromOrigin('https://valuation.upswitch.app.evil.example')).toBe(
      'https://valuation.upswitch.app'
    )
  })
})
