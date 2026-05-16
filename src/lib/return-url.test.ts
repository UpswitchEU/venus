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

  it('does not add the celebration marker on the advisor dashboard fallback when celebrating', () => {
    // The advisor dashboard is the no-client-context fallback; celebrating
    // there would surface a "valuation added to client" toast on a generic
    // landing page where no specific client is in view.
    const u = applyMercuryCelebrationQuery('https://upswitch.app/nl/advisor/dashboard', true)
    expect(u).not.toContain('from=valuation')
    expect(u).not.toContain('from=venus')
  })

  it('sets from=valuation on the seller PLG dashboard so Mercury can refresh + celebrate', () => {
    // Self-managed sellers ALWAYS return to /business/dashboard. Without this
    // marker the `useClientContext` query keeps serving its 60s-stale cache
    // and the freshly persisted valuation is invisible until a hard reload.
    for (const path of [
      'https://upswitch.app/nl/business/dashboard',
      'https://upswitch.app/en/business/dashboard',
      'https://upswitch.app/nl/business/dashboard/reports/abc',
    ]) {
      const u = applyMercuryCelebrationQuery(path, true)
      expect(u).toContain('from=valuation')
      expect(u).not.toContain('from=venus')
    }
  })

  it('overwrites a stale from=venus with from=valuation on celebration to retire the codename', () => {
    const u = applyMercuryCelebrationQuery(
      'https://upswitch.app/nl/advisor/clients/abc?from=venus',
      true
    )
    expect(u).toContain('from=valuation')
    expect(u).not.toContain('from=venus')
  })

  it('preserves a foreign from= value (campaign attribution) when celebrating — does NOT overwrite', () => {
    // A seller who landed on /business/dashboard?from=email_campaign,
    // then bounced to Venus, should still carry the campaign attribution
    // back to Mercury. The celebration helper only OWNS the
    // `valuation` / legacy `venus` values and must leave anything else
    // alone — otherwise the round-trip silently erases marketing data.
    const u = applyMercuryCelebrationQuery(
      'https://upswitch.app/nl/business/dashboard?from=email_campaign',
      true
    )
    expect(u).toContain('from=email_campaign')
    expect(u).not.toContain('from=valuation')
  })

  it('preserves a foreign from= value (campaign attribution) on plain exits — does NOT strip', () => {
    // Symmetric to the celebration case above: a non-celebration exit
    // must not strip campaign attribution either, otherwise non-saving
    // bounces silently break analytics on the destination page.
    const u = applyMercuryCelebrationQuery(
      'https://upswitch.app/nl/business/dashboard?from=newsletter&keep=1',
      false
    )
    expect(u).toContain('from=newsletter')
    expect(u).toContain('keep=1')
  })

  it('only strips from= when its value is one of OUR celebration markers', () => {
    // Mixed-key control: foreign `from` survives, but if the URL had
    // both a celebration-owned value AND another query, the strip is
    // surgical (no spillover into other params).
    const stripsOurs = applyMercuryCelebrationQuery(
      'https://upswitch.app/nl/advisor/clients/c1?from=valuation&utm_source=x',
      false
    )
    expect(stripsOurs).not.toContain('from=valuation')
    expect(stripsOurs).toContain('utm_source=x')
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

  it('appends from=valuation on the seller dashboard fallback so Mercury refreshes (handleExitClientView contract)', () => {
    // End-to-end pin for the actual seller-exit pathway: ManualLayout's
    // `handleExitClientView` passes `celebrateMercuryReturn: hasCompletedValuation`
    // along with the seller `source`. When the cached return_url is missing
    // (sessionStorage cleared, cross-tab, etc.) we MUST still fall through
    // to /business/dashboard AND keep the celebration marker so the seller
    // dashboard's `?from=valuation` refresh effect fires. Without this the
    // freshly-saved valuation stays invisible until the 60s React Query
    // staleTime elapses.
    const out = getSafeMercuryReturnUrl(null, {
      celebrateMercuryReturn: true,
      sourceApp: 'business_dashboard_orphaned_seller',
      locale: 'nl',
    })
    expect(out).toContain('https://upswitch.app/nl/business/dashboard')
    expect(out).toContain('from=valuation')
    expect(out).not.toContain('from=venus')
  })

  it('honors the seller dashboard celebration marker via an explicit return_url too', () => {
    const out = getSafeMercuryReturnUrl('https://www.upswitch.app/nl/business/dashboard', {
      celebrateMercuryReturn: true,
      sourceApp: 'mercury_seller_saas_arr',
      locale: 'nl',
    })
    expect(out).toContain('/nl/business/dashboard')
    expect(out).toContain('from=valuation')
  })

  it('does NOT celebrate when the seller exits Venus without producing a valuation', () => {
    // ManualLayout's `handleExitClientView` only sets
    // `celebrateMercuryReturn: true` when `report.valuation` is finite OR the
    // session has a valuationResult/htmlReport. A plain back-button exit must
    // therefore NOT trigger Mercury's refresh-on-return toast.
    const out = getSafeMercuryReturnUrl('https://www.upswitch.app/nl/business/dashboard', {
      celebrateMercuryReturn: false,
      sourceApp: 'business_dashboard_orphaned_seller',
      locale: 'nl',
    })
    expect(out).toContain('/nl/business/dashboard')
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
    expect(fallbackDashboardForSource('MERCURY_SELLER_HERO', 'en', mercury)).toBe(
      'https://upswitch.app/en/business/dashboard'
    )
  })

  it('strips a trailing slash on the mercuryUrl base', () => {
    expect(fallbackDashboardForSource('seller_dashboard', 'nl', 'https://upswitch.app/')).toBe(
      'https://upswitch.app/nl/business/dashboard'
    )
  })

  it('prefers accountant routing when both tokens appear (advisor wins by check order)', () => {
    // Edge case: a hypothetical `advisor_for_seller` source. Advisor is
    // checked first so we never silently change destinations for an
    // accountant flow that pairs an owner-ish token with the advisor mode.
    expect(fallbackDashboardForSource('advisor_for_seller', 'nl', mercury)).toBe(
      'https://upswitch.app/nl/advisor/dashboard'
    )
  })

  it('routes the StartupValuationTile source `client_dashboard` to /business/dashboard (was a latent gap)', () => {
    // `StartupValuationTile` (mounted on /business/dashboard) hands off to
    // Venus with `source=client_dashboard`. Without this token the safety
    // fallback would silently route a seller to /advisor/dashboard whenever
    // sessionStorage dropped the explicit return_url — wrong persona, 404.
    expect(fallbackDashboardForSource('client_dashboard', 'nl', mercury)).toBe(
      'https://upswitch.app/nl/business/dashboard'
    )
    expect(fallbackDashboardForSource('client_dashboard', 'en', mercury)).toBe(
      'https://upswitch.app/en/business/dashboard'
    )
  })

  it('routes the SaaS / ARR seller tile source to /business/dashboard', () => {
    // The new `mercury_seller_saas_arr` source already matches `seller`, but
    // we pin it explicitly so a future renaming PR cannot drop the contract
    // without flipping a test red.
    expect(fallbackDashboardForSource('mercury_seller_saas_arr', 'nl', mercury)).toBe(
      'https://upswitch.app/nl/business/dashboard'
    )
  })

  it('routes `for_owners`-prefixed sources to /business/dashboard (covers the existing market-approach hand-off)', () => {
    // `apps/mercury/shared/utils/buildStartupValuationVenusUrl.ts` emits
    // `source=for_owners_landing` for the owner-market hand-off. Pin it so
    // a future rename can't drop the persona signal silently.
    expect(fallbackDashboardForSource('for_owners_landing', 'nl', mercury)).toBe(
      'https://upswitch.app/nl/business/dashboard'
    )
  })
})
