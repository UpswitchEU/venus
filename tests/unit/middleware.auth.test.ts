import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl/middleware', () => ({
  default: () => {
    return (request: NextRequest) => {
      const response = NextResponse.next()
      response.headers.set('x-intl-pathname', request.nextUrl.pathname)
      return response
    }
  },
}))

import { middleware } from '../../middleware'

function request(path: string, cookie?: string): NextRequest {
  const headers = new Headers({
    host: 'valuation.upswitch.app',
  })
  if (cookie) headers.set('cookie', cookie)

  return new NextRequest(`https://valuation.upswitch.app${path}`, {
    headers,
  })
}

function redirectLocation(response: Response): string {
  return response.headers.get('location') ?? ''
}

describe('Venus middleware report access gate', () => {
  it('redirects direct report access to Mercury login when both auth cookies are absent', async () => {
    const response = await middleware(request('/en/reports/report-123'))
    const location = redirectLocation(response)

    expect(response.status).toBe(307)
    expect(location).toContain('https://www.upswitch.app/en/auth/login')
    expect(location).toContain(
      'returnUrl=https%3A%2F%2Fvaluation.upswitch.app%2Fen%2Freports%2Freport-123'
    )
  })

  it('does not accept similarly named cookies as auth evidence', async () => {
    const response = await middleware(
      request('/nl/reports/report-123', 'not_upswitch_access_token=spoofed')
    )

    expect(response.status).toBe(307)
    expect(redirectLocation(response)).toContain('https://www.upswitch.app/nl/auth/login')
  })

  it('allows report access when the refresh cookie is present', async () => {
    const response = await middleware(
      request('/nl/reports/report-123', 'upswitch_refresh_token=refresh-token')
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-intl-pathname')).toBe('/nl/reports/report-123')
  })

  it('keeps the new-report route public so users can start the calculator', async () => {
    const response = await middleware(request('/en/reports/new'))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-intl-pathname')).toBe('/en/reports/new')
  })
})
