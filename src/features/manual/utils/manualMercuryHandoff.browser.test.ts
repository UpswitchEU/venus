// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readManualMercuryHandoffFromBrowser } from './manualMercuryNavigate'

describe('Mercury handoff context in the browser', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/en/reports/current')
    sessionStorage.clear()
    sessionStorage.setItem('upswitch_return_url', '/nl/advisor/clients/old-company')
    sessionStorage.setItem('upswitch_source', 'accountant')
  })
  afterEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
    window.history.replaceState(null, '', '/')
  })

  it('uses the current company and locale rather than a previous handoff', () => {
    const query = new URLSearchParams({
      return_url: '/fr/advisor/clients/current-company',
      source: 'mercury',
    })
    window.history.replaceState(null, '', `/fr/reports/current?${query}`)
    expect(readManualMercuryHandoffFromBrowser()).toEqual({
      returnUrl: '/fr/advisor/clients/current-company',
      sourceApp: 'mercury',
    })
  })

  it('preserves URL context when session storage is blocked', () => {
    const query = new URLSearchParams({
      return_url: '/fr/business/dashboard',
      source: 'business_dashboard',
    })
    window.history.replaceState(null, '', `/fr/reports/current?${query}`)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })
    expect(readManualMercuryHandoffFromBrowser()).toEqual({
      returnUrl: '/fr/business/dashboard',
      sourceApp: 'business_dashboard',
    })
  })

  it('does not pair a new owner source with a stored advisor destination', () => {
    window.history.replaceState(null, '', '/en/reports/current?source=business_dashboard')
    expect(readManualMercuryHandoffFromBrowser()).toEqual({
      returnUrl: null,
      sourceApp: 'business_dashboard',
    })
  })

  it('resumes a safe stored handoff when the URL no longer carries one', () => {
    expect(readManualMercuryHandoffFromBrowser()).toEqual({
      returnUrl: '/nl/advisor/clients/old-company',
      sourceApp: 'accountant',
    })
  })

  it.each([
    '//evil.example/redirect',
    '/\\evil.example/redirect',
    'https://evil.example/redirect',
  ])('rejects unsafe current destinations without resurrecting stored context: %s', (returnUrl) => {
    window.history.replaceState(
      null,
      '',
      `/en/reports/current?${new URLSearchParams({ return_url: returnUrl })}`
    )
    expect(readManualMercuryHandoffFromBrowser()).toEqual({ returnUrl: null, sourceApp: null })
  })
})
