// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  buildManualMercuryReturnFromBrowser,
  resolveMercuryNavigationPathForEmbed,
} from './manualMercuryNavigate'
import { stripStaleSellerDashboardPhaseFromReturnUrl } from './manualMercuryNavigation'

describe('resolveMercuryNavigationPathForEmbed', () => {
  it('returns same-origin absolute paths', () => {
    expect(
      resolveMercuryNavigationPathForEmbed(
        'https://preview.upswitch.app/nl/business/dashboard?from=valuation',
        'https://preview.upswitch.app'
      )
    ).toBe('/nl/business/dashboard?from=valuation')
  })

  it('rewrites legacy import-review client paths before embedded navigation', () => {
    expect(
      resolveMercuryNavigationPathForEmbed(
        '/nl/advisor/clients/c1?import_review=1&session_key=val_1700000000000_abc'
      )
    ).toBe('/nl/advisor/import-review?clientId=c1&sessionKey=val_1700000000000_abc')

    expect(
      resolveMercuryNavigationPathForEmbed(
        '/nl/advisor/clients/client%201?import_review=1&session_key=../../../etc/passwd'
      )
    ).toBe('/nl/advisor/import-review?clientId=client+1')
  })

  it('returns non-import-review relative paths unchanged', () => {
    expect(resolveMercuryNavigationPathForEmbed('/nl/advisor/clients/c1')).toBe(
      '/nl/advisor/clients/c1'
    )
  })

  it('rejects cross-origin URLs', () => {
    expect(
      resolveMercuryNavigationPathForEmbed(
        'https://evil.example/phish',
        'https://preview.upswitch.app'
      )
    ).toBeNull()
  })

  it('rejects protocol-relative paths', () => {
    expect(resolveMercuryNavigationPathForEmbed('//evil.example/phish')).toBeNull()
  })
})

describe('buildManualMercuryReturnFromBrowser', () => {
  it('falls back to advisor dashboard when no handoff is stored', () => {
    const url = buildManualMercuryReturnFromBrowser({
      currentLocale: 'en',
      hasCompletedValuation: false,
      mercuryUrl: 'https://preview.upswitch.app',
    })
    expect(url).toContain('/en/advisor/dashboard')
  })
})

describe('stripStaleSellerDashboardPhaseFromReturnUrl', () => {
  it('removes phase from seller dashboard absolute URLs', () => {
    expect(
      stripStaleSellerDashboardPhaseFromReturnUrl(
        'https://preview.upswitch.app/nl/business/dashboard?phase=valuation&from=email'
      )
    ).toBe('https://preview.upswitch.app/nl/business/dashboard?from=email')
  })

  it('leaves advisor client URLs untouched', () => {
    const url = 'https://mercury.test/nl/advisor/clients/c1?phase=valuation'
    expect(stripStaleSellerDashboardPhaseFromReturnUrl(url)).toBe(url)
  })

  it('removes phase from relative seller dashboard paths', () => {
    expect(
      stripStaleSellerDashboardPhaseFromReturnUrl('/nl/business/dashboard?phase=valuation')
    ).toBe('/nl/business/dashboard')
  })
})
