import { describe, expect, it } from 'vitest'
import {
  safeExternalHref,
  safeNewTabUrl,
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

describe('safeNewTabUrl', () => {
  it('allows internal paths and external HTTPS URLs', () => {
    expect(safeNewTabUrl('/nl/reports/new')).toBe('/nl/reports/new')
    expect(safeNewTabUrl('https://upswitch.app/nl/auth/signup')).toBe(
      'https://upswitch.app/nl/auth/signup'
    )
  })

  it('rejects unsafe schemes and untrusted HTTP URLs', () => {
    expect(safeNewTabUrl('javascript:alert(1)')).toBeNull()
    expect(safeNewTabUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeNewTabUrl('http://evil.example/report.pdf')).toBeNull()
  })
})

describe('safeExternalHref', () => {
  it('allows HTTPS and loopback HTTP links only', () => {
    expect(safeExternalHref('https://example.com/source')).toBe('https://example.com/source')
    expect(safeExternalHref('http://localhost:3000/source')).toBe('http://localhost:3000/source')
    expect(safeExternalHref('http://evil.example/source')).toBeNull()
  })

  it('rejects internal paths and unsafe schemes', () => {
    expect(safeExternalHref('/nl/reports/new')).toBeNull()
    expect(safeExternalHref('javascript:alert(1)')).toBeNull()
    expect(safeExternalHref('data:text/html,<script>alert(1)</script>')).toBeNull()
  })
})
