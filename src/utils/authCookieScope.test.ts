import { describe, expect, it } from 'vitest'
import {
  describeDuplicateAuthCookies,
  detectDuplicateAuthCookies,
  hasConflictingAuthCookies,
  readAllCookieValues,
} from './authCookieScope'

/**
 * Regression cover for the 2026-09-19 cross-account session bleed.
 *
 * Venus is the surface where the reporter said "I go to Venus and I'm logged
 * in as somebody else". Its BFF merges the raw `Cookie` header into a
 * name-keyed map (last wins) before forwarding to Titan, which collapses the
 * conflict away — so Titan's own fail-closed guard would never see it, and
 * Venus would serve a jar that Mercury bounces and Titan refuses.
 */
describe('authCookieScope', () => {
  // Older (stale) value first, exactly as RFC 6265 §5.4 orders it.
  const CONFLICTING_JAR =
    'upswitch_refresh_token=STALE_USER; upswitch_access_token=STALE_USER; ' +
    'upswitch_refresh_token=CURRENT_USER; upswitch_access_token=CURRENT_USER'

  it('sees every value the merge would have discarded', () => {
    expect(readAllCookieValues(CONFLICTING_JAR, 'upswitch_access_token')).toEqual([
      'STALE_USER',
      'CURRENT_USER',
    ])
  })

  it('flags a two-identity jar', () => {
    expect(hasConflictingAuthCookies(CONFLICTING_JAR)).toBe(true)
    expect(
      detectDuplicateAuthCookies(CONFLICTING_JAR)
        .map((d) => d.name)
        .sort()
    ).toEqual(['upswitch_access_token', 'upswitch_refresh_token'])
  })

  it('accepts a healthy single-identity jar', () => {
    expect(hasConflictingAuthCookies('upswitch_access_token=A; upswitch_refresh_token=R')).toBe(
      false
    )
  })

  it('does not treat a same-value duplicate as an identity conflict', () => {
    const jar = 'upswitch_access_token=A; upswitch_access_token=A'
    expect(hasConflictingAuthCookies(jar)).toBe(false)
    expect(detectDuplicateAuthCookies(jar)[0]?.conflicting).toBe(false)
  })

  it('treats a quoted duplicate of the same token as one identity', () => {
    expect(hasConflictingAuthCookies('upswitch_access_token=A; upswitch_access_token="A"')).toBe(
      false
    )
  })

  it('is not fooled by a name that merely ends with an identity cookie name', () => {
    expect(
      detectDuplicateAuthCookies('x_upswitch_access_token=OTHER; upswitch_access_token=A')
    ).toEqual([])
  })

  it('ignores non-identity cookies that repeat', () => {
    expect(detectDuplicateAuthCookies('NEXT_LOCALE=nl; NEXT_LOCALE=fr')).toEqual([])
  })

  it('tolerates an absent or empty header', () => {
    expect(detectDuplicateAuthCookies(null)).toEqual([])
    expect(detectDuplicateAuthCookies('')).toEqual([])
    expect(readAllCookieValues(undefined, 'upswitch_access_token')).toEqual([])
  })

  it('never prints a token value in its summary', () => {
    const summary = describeDuplicateAuthCookies(detectDuplicateAuthCookies(CONFLICTING_JAR))
    expect(summary).toContain('conflicting=true')
    expect(summary).not.toContain('STALE_USER')
    expect(summary).not.toContain('CURRENT_USER')
  })
})
