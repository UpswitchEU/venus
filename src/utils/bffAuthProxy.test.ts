import { describe, expect, it } from 'vitest'
import {
  buildBffCookieHeader,
  getResponseSetCookieList,
  mergeCookieHeaderFromSetCookieHeaders,
} from '@/utils/bffAuthProxy'

describe('mergeCookieHeaderFromSetCookieHeaders', () => {
  it('merges Set-Cookie first segments into a Cookie header', () => {
    const merged = mergeCookieHeaderFromSetCookieHeaders('foo=1', [
      'upswitch_access_token=abc; Path=/; HttpOnly',
      'upswitch_refresh_token=def; Path=/; HttpOnly',
    ])
    expect(merged).toContain('foo=1')
    expect(merged).toContain('upswitch_access_token=abc')
    expect(merged).toContain('upswitch_refresh_token=def')
  })
})

describe('buildBffCookieHeader', () => {
  it('merges store-only auth cookies into a non-empty request header', () => {
    const merged = buildBffCookieHeader('foo=1', 'upswitch_refresh_token=rt')
    expect(merged).toContain('foo=1')
    expect(merged).toContain('upswitch_refresh_token=rt')
  })

  it('falls back to store when request header is empty', () => {
    expect(buildBffCookieHeader('', 'a=b')).toBe('a=b')
  })
})

describe('getResponseSetCookieList', () => {
  it('uses getSetCookie when present', () => {
    const res = {
      headers: {
        getSetCookie: () => ['a=1; Path=/'],
        get: () => null,
      },
    } as unknown as Response
    expect(getResponseSetCookieList(res)).toEqual(['a=1; Path=/'])
  })

  it('falls back to single set-cookie header', () => {
    const res = {
      headers: {
        get: (name: string) => (name.toLowerCase() === 'set-cookie' ? 'sess=x; Path=/' : null),
      },
    } as unknown as Response
    expect(getResponseSetCookieList(res)).toEqual(['sess=x; Path=/'])
  })
})
