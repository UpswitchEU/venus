import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import {
  getReportIdRequiringAuth,
  hasReportAccessCookie,
  redirectToMercuryLogin,
} from './reportAccess'

function request(cookie?: string): NextRequest {
  const headers = new Headers()
  if (cookie) headers.set('cookie', cookie)

  return new NextRequest('https://valuation.upswitch.app/nl/reports/report-123', {
    headers,
  })
}

describe('report access middleware helpers', () => {
  it('identifies persisted reports as protected and keeps new-report public', () => {
    expect(getReportIdRequiringAuth('/reports/report-123')).toBe('report-123')
    expect(getReportIdRequiringAuth('/reports/new')).toBeNull()
    expect(getReportIdRequiringAuth('/landing/startup')).toBeNull()
  })

  it('only accepts exact UpSwitch access or refresh cookie names', () => {
    expect(hasReportAccessCookie(request('upswitch_access_token=access'))).toBe(true)
    expect(hasReportAccessCookie(request('upswitch_refresh_token=refresh'))).toBe(true)
    expect(hasReportAccessCookie(request('not_upswitch_access_token=spoofed'))).toBe(false)
  })

  it('builds a Mercury login redirect with the original Venus URL as returnUrl', () => {
    const response = redirectToMercuryLogin(request(), 'nl', 'https://www.upswitch.app')
    const location = response.headers.get('location') ?? ''

    expect(response.status).toBe(307)
    expect(location).toContain('https://www.upswitch.app/nl/auth/login')
    expect(location).toContain(
      'returnUrl=https%3A%2F%2Fvaluation.upswitch.app%2Fnl%2Freports%2Freport-123'
    )
  })
})
