import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

vi.mock('@/utils/bffAuthProxy', () => ({
  getBffCookieHeaderForTitan: vi.fn().mockResolvedValue({ cookieHeader: '' }),
  getResponseSetCookieList: vi.fn(() => []),
}))

vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: vi.fn().mockResolvedValue(new Response(null)),
}))

vi.mock('@/utils/getTitanApiUrl', () => ({
  getTitanApiUrl: () => 'https://api.upswitch.app',
}))

function request(url: string, referer = 'https://valuation.upswitch.app/en'): Request {
  return new Request(url, {
    headers: { referer },
  })
}

describe('Venus /api/auth/logout redirect hardening', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('does not build internal fallback redirects from an untrusted request origin', async () => {
    const res = await GET(
      request('https://evil-phishing.example/api/auth/logout?fallback=1&next=%2Fnl%2Freports')
    )

    const location = new URL(res.headers.get('location') ?? '')
    expect(location.origin).toBe('https://valuation.upswitch.app')
    expect(location.pathname).toBe('/nl/reports')
  })

  it('rejects protocol-relative next params before redirecting', async () => {
    const res = await GET(
      request('https://valuation.upswitch.app/api/auth/logout?fallback=1&next=%2F%2Fevil.test')
    )

    const location = new URL(res.headers.get('location') ?? '')
    expect(location.origin).toBe('https://valuation.upswitch.app')
    expect(location.pathname).toBe('/en')
  })

  it('keeps trusted preview Venus origins usable', async () => {
    const res = await GET(
      request('https://preview.valuation.upswitch.app/api/auth/logout?fallback=1&next=%2Ffr')
    )

    const location = new URL(res.headers.get('location') ?? '')
    expect(location.origin).toBe('https://preview.valuation.upswitch.app')
    expect(location.pathname).toBe('/fr')
  })

  it('preserves allowlisted Mercury post_logout redirects', async () => {
    const postLogout = encodeURIComponent('https://www.upswitch.app/nl/auth/login')
    const res = await GET(
      request(`https://valuation.upswitch.app/api/auth/logout?fallback=1&post_logout=${postLogout}`)
    )

    expect(res.headers.get('location')).toBe('https://www.upswitch.app/nl/auth/login')
  })
})
