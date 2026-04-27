/**
 * studioReturnUrls — pure URL builder contract tests.
 *
 * These pin the cross-app URL contract that ties together:
 *   • `useStartupStudioRedirect` (the redirect-bypass keys off the
 *     return signals built here),
 *   • `StartupSubmitFooter` auto-fire (same signals),
 *   • Mercury bootstrap fallback at `SessionBootstrapService.ts:662`
 *     (needs `source=mercury` + `reportId` + no `clientToken` to
 *     restore accountant-for-client identity), and
 *   • `usePreSelectedMethodSessionSync` (seeds the venture method on
 *     `selected_method=startup_valuation`).
 *
 * A regression in any of these strings silently breaks the Mercury →
 * Venus → back round-trip; cover the contract directly.
 */

import { describe, expect, it } from 'vitest'
import type { AdvisorHandoff } from '@/components/calculator/sections/startup/StartupAwareInputPanel'
import { buildAdvisorReturnUrl, buildFounderReturnUrl } from './studioReturnUrls'

describe('buildAdvisorReturnUrl', () => {
  const baseHandoff: AdvisorHandoff = {
    reportId: 'rep-abc',
    locale: 'nl',
    mode: 'accountant',
    clientId: 'client-xyz',
    returnUrl: 'https://mercury.example/back?ref=foo',
    source: 'mercury',
  }

  it('preserves report id, locale, and every Mercury context field', () => {
    const url = buildAdvisorReturnUrl(baseHandoff)
    expect(url.startsWith('/nl/reports/rep-abc?')).toBe(true)

    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('selected_method')).toBe('startup_valuation')
    expect(params.get('studio_completed')).toBe('1')
    expect(params.get('mode')).toBe('accountant')
    expect(params.get('clientId')).toBe('client-xyz')
    expect(params.get('return_url')).toBe('https://mercury.example/back?ref=foo')
    // CRITICAL: source must be `mercury`, NOT `studio_v2`.  The bootstrap
    // fallback at SessionBootstrapService.ts:662 keys on `sourceApp ===
    // 'mercury'` to restore accountant-for-client identity when no
    // clientToken is present (the token was already consumed on entry).
    expect(params.get('source')).toBe('mercury')
  })

  it('encodes the return_url so query characters in it survive a round-trip', () => {
    const url = buildAdvisorReturnUrl({
      ...baseHandoff,
      returnUrl: 'https://mercury.example/back?ref=foo&x=y%26z',
    })
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('return_url')).toBe('https://mercury.example/back?ref=foo&x=y%26z')
  })

  it('falls back to en locale when handoff.locale is anything other than nl', () => {
    expect(buildAdvisorReturnUrl({ ...baseHandoff, locale: 'en' })).toMatch(
      /^\/en\/reports\/rep-abc\?/
    )
    // Defensive: locale field is typed `'en' | 'nl'` but defend against
    // a malformed payload from sessionStorage all the same.
    expect(buildAdvisorReturnUrl({ ...baseHandoff, locale: 'fr' as 'en' | 'nl' })).toMatch(
      /^\/en\/reports\/rep-abc\?/
    )
  })

  it('omits Mercury context fields that are missing rather than serialising empty values', () => {
    const url = buildAdvisorReturnUrl({
      reportId: 'rep-only',
      locale: 'en',
    })
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.has('mode')).toBe(false)
    expect(params.has('clientId')).toBe(false)
    expect(params.has('return_url')).toBe(false)
    expect(params.has('source')).toBe(false)
    // Required fields ALWAYS present — these are the cross-app contract.
    expect(params.get('selected_method')).toBe('startup_valuation')
    expect(params.get('studio_completed')).toBe('1')
  })

  it('omits empty-string Mercury fields (treated as missing)', () => {
    const url = buildAdvisorReturnUrl({
      ...baseHandoff,
      mode: '',
      clientId: '',
      returnUrl: '',
      source: '',
    })
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.has('mode')).toBe(false)
    expect(params.has('clientId')).toBe(false)
    expect(params.has('return_url')).toBe(false)
    expect(params.has('source')).toBe(false)
  })

  it('appends the partner suffix verbatim when supplied', () => {
    const url = buildAdvisorReturnUrl(baseHandoff, '&partner=imec')
    expect(url.endsWith('&partner=imec')).toBe(true)
    // And the existing params are still all there.
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('partner')).toBe('imec')
    expect(params.get('selected_method')).toBe('startup_valuation')
  })

  it('produces a URL with no partner key when suffix is empty', () => {
    const url = buildAdvisorReturnUrl(baseHandoff, '')
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.has('partner')).toBe(false)
  })

  it('NEVER emits source=studio_v2 (would clobber the Mercury bootstrap fallback)', () => {
    const url = buildAdvisorReturnUrl(baseHandoff)
    expect(url).not.toContain('source=studio_v2')
    // And `studio_completed=1` IS the wizard-done signal here — pin it
    // explicitly so a refactor can't silently swap to source-based.
    expect(url).toContain('studio_completed=1')
  })
})

describe('buildFounderReturnUrl', () => {
  it('points at /reports/new with the founder studio_v2 contract', () => {
    expect(buildFounderReturnUrl('en')).toBe(
      '/en/reports/new?selected_method=startup_valuation&source=studio_v2'
    )
    expect(buildFounderReturnUrl('nl')).toBe(
      '/nl/reports/new?selected_method=startup_valuation&source=studio_v2'
    )
  })

  it('appends the partner suffix verbatim', () => {
    expect(buildFounderReturnUrl('en', '&partner=kbc')).toBe(
      '/en/reports/new?selected_method=startup_valuation&source=studio_v2&partner=kbc'
    )
  })
})
