import { describe, expect, it } from 'vitest'
import {
  getCookieValueFromHeader,
  getTitanAccessTokenFromCookieHeader,
  hasTitanAccessCookie,
  hasTitanAuthCookie,
  hasTitanRefreshCookie,
} from './cookieHeader'

describe('cookieHeader auth parsing', () => {
  it('matches cookie names exactly, not by substring', () => {
    const cookieHeader =
      'not_upswitch_access_token=spoofed; foo_upswitch_refresh_token=also-spoofed'

    expect(hasTitanAccessCookie(cookieHeader)).toBe(false)
    expect(hasTitanRefreshCookie(cookieHeader)).toBe(false)
    expect(hasTitanAuthCookie(cookieHeader)).toBe(false)
    expect(getTitanAccessTokenFromCookieHeader(cookieHeader)).toBeNull()
  })

  it('extracts the exact Titan access token from a mixed Cookie header', () => {
    const cookieHeader =
      'theme=dark; upswitch_access_token=access.jwt; upswitch_refresh_token=refresh.jwt'

    expect(getTitanAccessTokenFromCookieHeader(cookieHeader)).toBe('access.jwt')
    expect(hasTitanAccessCookie(cookieHeader)).toBe(true)
    expect(hasTitanRefreshCookie(cookieHeader)).toBe(true)
    expect(hasTitanAuthCookie(cookieHeader)).toBe(true)
  })

  it('keeps values with equals signs intact', () => {
    expect(
      getCookieValueFromHeader('upswitch_access_token=a=b=c; theme=dark', 'upswitch_access_token')
    ).toBe('a=b=c')
  })
})
