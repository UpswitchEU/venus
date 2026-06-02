import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getReportIdRequiringAuth,
  hasReportAccessCookie,
  redirectToMercuryLogin,
  shouldAllowLocalDevelopmentDraftReportRequest,
} from './reportAccess'

function request(cookie?: string, url = 'https://valuation.upswitch.app/nl/reports/report-123') {
  const headers = new Headers()
  if (cookie) headers.set('cookie', cookie)

  return new NextRequest(url, {
    headers,
  })
}

describe('report access middleware helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

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

  it('allows only local development Venus-generated draft report URLs without delegated context', () => {
    vi.stubEnv('NODE_ENV', 'development')

    const venusDraft = 'val_1780386483187_v024ec083e'
    const mercuryDraft = 'val_1780386483187_m024ec083e'

    expect(
      shouldAllowLocalDevelopmentDraftReportRequest(
        request(undefined, `http://localhost:3001/nl/reports/${venusDraft}`),
        venusDraft
      )
    ).toBe(true)

    expect(
      shouldAllowLocalDevelopmentDraftReportRequest(
        request(undefined, `http://localhost:3001/nl/reports/${mercuryDraft}`),
        mercuryDraft
      )
    ).toBe(false)

    expect(
      shouldAllowLocalDevelopmentDraftReportRequest(
        request(undefined, `https://valuation.upswitch.app/nl/reports/${venusDraft}`),
        venusDraft
      )
    ).toBe(false)

    expect(
      shouldAllowLocalDevelopmentDraftReportRequest(
        request(
          undefined,
          `http://localhost:3001/nl/reports/${venusDraft}?source=mercury&clientId=client-1`
        ),
        venusDraft
      )
    ).toBe(false)

    vi.stubEnv('NODE_ENV', 'production')

    expect(
      shouldAllowLocalDevelopmentDraftReportRequest(
        request(undefined, `http://localhost:3001/nl/reports/${venusDraft}`),
        venusDraft
      )
    ).toBe(false)
  })
})
