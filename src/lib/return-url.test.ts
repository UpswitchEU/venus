import { describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/getMercuryUrl', () => ({
  getMercuryUrl: () => 'https://upswitch.app',
}))

import {
  applyMercuryCelebrationQuery,
  fallbackDashboardForSource,
  getSafeMercuryReturnUrl,
  isSafeMercuryReturnUrlInput,
  isTrustedUpswitchHostname,
} from './return-url'

describe('applyMercuryCelebrationQuery', () => {
  it('strips from when not celebrating (legacy from=venus value)', () => {
    expect(
      applyMercuryCelebrationQuery('https://upswitch.app/nl/advisor/clients/x?from=venus', false)
    ).toBe('https://upswitch.app/nl/advisor/clients/x')
  })

  it('strips from when not celebrating (current from=valuation value)', () => {
    expect(
      applyMercuryCelebrationQuery(
        'https://upswitch.app/nl/advisor/clients/x?from=valuation',
        false
      )
    ).toBe('https://upswitch.app/nl/advisor/clients/x')
  })

  it('sets from=valuation on accountant client paths when celebrating (no codename leak)', () => {
    const u = applyMercuryCelebrationQuery('https://upswitch.app/nl/advisor/clients/abc', true)
    expect(u).toContain('from=valuation')
    expect(u).not.toContain('from=venus')
  })

  it('sets from=valuation on legacy /accountant/clients/ paths when celebrating (301 may not run in iframe)', () => {
    const u = applyMercuryCelebrationQuery('https://upswitch.app/nl/accountant/clients/abc', true)
    expect(u).toContain('from=valuation')
    expect(u).not.toContain('from=venus')
  })

  it('does not add the celebration marker on dashboard URLs when celebrating', () => {
    const u = applyMercuryCelebrationQuery('https://upswitch.app/nl/advisor/dashboard', true)
    expect(u).not.toContain('from=valuation')
    expect(u).not.toContain('from=venus')
  })

  it('overwrites a stale from=venus with from=valuation on celebration to retire the codename', () => {
    const u = applyMercuryCelebrationQuery(
      'https://upswitch.app/nl/advisor/clients/abc?from=venus',
      true
    )
    expect(u).toContain('from=valuation')
    expect(u).not.toContain('from=venus')
  })
})

describe('isTrustedUpswitchHostname', () => {
  it('rejects typosquats where the label merely contains upswitch.app as a substring', () => {
    expect(isTrustedUpswitchHostname('notupswitch.app')).toBe(false)
  })

  it('accepts real Upswitch apex and subdomains', () => {
    expect(isTrustedUpswitchHostname('upswitch.app')).toBe(true)
    expect(isTrustedUpswitchHostname('www.upswitch.app')).toBe(true)
    expect(isTrustedUpswitchHostname('valuation.upswitch.app')).toBe(true)
  })
})

describe('isSafeMercuryReturnUrlInput', () => {
  it('accepts safe Mercury-relative paths used by toolbar return flows', () => {
    expect(isSafeMercuryReturnUrlInput('/nl/my-business/overview')).toBe(true)
    expect(isSafeMercuryReturnUrlInput('/nl/advisor/clients/c1')).toBe(true)
  })

  it('rejects typosquats and protocol-relative values before they are stored', () => {
    expect(isSafeMercuryReturnUrlInput('https://notupswitch.app/phish')).toBe(false)
    expect(isSafeMercuryReturnUrlInput('//evil.example/phish')).toBe(false)
  })
})

describe('getSafeMercuryReturnUrl', () => {
  it('rejects notupswitch.app typosquat and falls back to dashboard', () => {
    const out = getSafeMercuryReturnUrl('https://notupswitch.app/phish', { locale: 'en' })
    expect(out).toBe('https://upswitch.app/en/advisor/dashboard')
  })

  it('rejects protocol-relative stored paths (//...) and falls back to dashboard', () => {
    const out = getSafeMercuryReturnUrl('//evil.example/phish', { locale: 'en' })
    expect(out).toBe('https://upswitch.app/en/advisor/dashboard')
  })

  it('upgrades http to https for production Upswitch hosts (no cleartext downgrade)', () => {
    const out = getSafeMercuryReturnUrl('http://valuation.upswitch.app/en/foo?x=1', {
      locale: 'en',
    })
    expect(out).toBe('https://valuation.upswitch.app/en/foo?x=1')
  })

  it('preserves http for localhost dev', () => {
    const out = getSafeMercuryReturnUrl('http://localhost:3000/en/foo', { locale: 'en' })
    expect(out).toBe('http://localhost:3000/en/foo')
  })

  it('strips legacy from=venus from stored absolute URLs when celebrate is false', () => {
    const out = getSafeMercuryReturnUrl(
      'https://upswitch.app/nl/advisor/clients/c1?from=venus&keep=1',
      { celebrateMercuryReturn: false }
    )
    expect(out).not.toContain('from=venus')
    expect(out).not.toContain('from=valuation')
    expect(out).toContain('keep=1')
  })

  it('appends from=valuation (no codename) for client URLs when celebrate is true', () => {
    const out = getSafeMercuryReturnUrl('https://upswitch.app/nl/advisor/clients/c1', {
      celebrateMercuryReturn: true,
    })
    expect(out).toContain('from=valuation')
    expect(out).not.toContain('from=venus')
  })

  it('does not append the celebration marker to dashboard fallback when celebrate is true', () => {
    const out = getSafeMercuryReturnUrl(null, {
      celebrateMercuryReturn: true,
      sourceApp: 'mercury',
      locale: 'nl',
    })
    expect(out).toBe('https://upswitch.app/nl/advisor/dashboard')
    expect(out).not.toContain('from=valuation')
    expect(out).not.toContain('from=venus')
  })

  it('rewrites stored absolute Mercury URL to match locale when options.locale is set', () => {
    const out = getSafeMercuryReturnUrl('https://upswitch.app/en/advisor/settings?tab=billing', {
      locale: 'nl',
    })
    expect(out).toBe('https://upswitch.app/nl/advisor/settings?tab=billing')
  })

  it('rewrites stored nl path to en when options.locale is en', () => {
    const out = getSafeMercuryReturnUrl('https://upswitch.app/nl/advisor/clients/c1', {
      locale: 'en',
    })
    expect(out).toBe('https://upswitch.app/en/advisor/clients/c1')
  })

  it('falls back to /business/dashboard when the storedUrl is missing for a seller-flagged source', () => {
    // Regression: a seller who clicked "Vul uw cijfers in" on the business
    // dashboard would land on /advisor/dashboard (404 / wrong persona) when
    // sessionStorage was cleared. The source token preserves the persona
    // signal even without an explicit return_url.
    const out = getSafeMercuryReturnUrl(null, {
      sourceApp: 'business_dashboard_orphaned_seller',
      locale: 'nl',
    })
    expect(out).toBe('https://upswitch.app/nl/business/dashboard')
  })

  it('keeps /advisor/dashboard fallback for accountant-flagged sources', () => {
    const out = getSafeMercuryReturnUrl(null, {
      sourceApp: 'mercury_advisor_review',
      locale: 'en',
    })
    expect(out).toBe('https://upswitch.app/en/advisor/dashboard')
  })

  it('routes typosquat (untrusted host) for a seller source to /business/dashboard, not /advisor/', () => {
    const out = getSafeMercuryReturnUrl('https://notupswitch.app/phish', {
      sourceApp: 'mercury_seller_card',
      locale: 'nl',
    })
    expect(out).toBe('https://upswitch.app/nl/business/dashboard')
  })
})

describe('fallbackDashboardForSource', () => {
  const mercury = 'https://upswitch.app'

  it('routes seller / owner / startup tokens to /business/dashboard', () => {
    for (const source of [
      'business_dashboard_orphaned_seller',
      'mercury_seller_card',
      'for_owners_landing',
      'mercury_startup_bypass',
      'orphaned_seller_modal',
    ]) {
      expect(fallbackDashboardForSource(source, 'nl', mercury)).toBe(
        'https://upswitch.app/nl/business/dashboard'
      )
    }
  })

  it('routes accountant / advisor tokens to /advisor/dashboard', () => {
    for (const source of [
      'mercury_advisor_review',
      'accountant_dashboard',
      'advisor_clients_list',
    ]) {
      expect(fallbackDashboardForSource(source, 'en', mercury)).toBe(
        'https://upswitch.app/en/advisor/dashboard'
      )
    }
  })

  it('returns /advisor/dashboard for ambiguous / unknown / empty source values', () => {
    for (const source of ['mercury', '', null, undefined, 'unknown_widget']) {
      expect(fallbackDashboardForSource(source, 'nl', mercury)).toBe(
        'https://upswitch.app/nl/advisor/dashboard'
      )
    }
  })

  it('is case-insensitive', () => {
    expect(
      fallbackDashboardForSource('MERCURY_SELLER_HERO', 'en', mercury)
    ).toBe('https://upswitch.app/en/business/dashboard')
  })

  it('strips a trailing slash on the mercuryUrl base', () => {
    expect(
      fallbackDashboardForSource('seller_dashboard', 'nl', 'https://upswitch.app/')
    ).toBe('https://upswitch.app/nl/business/dashboard')
  })

  it('prefers accountant routing when both tokens appear (advisor wins by check order)', () => {
    // Edge case: a hypothetical `advisor_for_seller` source. Advisor is
    // checked first so we never silently change destinations for an
    // accountant flow that pairs an owner-ish token with the advisor mode.
    expect(
      fallbackDashboardForSource('advisor_for_seller', 'nl', mercury)
    ).toBe('https://upswitch.app/nl/advisor/dashboard')
  })
})
