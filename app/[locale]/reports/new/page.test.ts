import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirectMock = vi.hoisted(() => vi.fn())
const generateReportIdMock = vi.hoisted(() => vi.fn(() => 'rep_test_id_xxxxxx'))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

vi.mock('../../../../src/utils/reportIdGenerator', () => ({
  generateReportId: generateReportIdMock,
}))

import NewReportPage from './page'

/**
 * Regression test for the cross-app prefill contract.
 *
 * `/reports/new` is a server component that generates a fresh report id and
 * redirects to `/reports/{id}`. Any query param Mercury sends MUST be in the
 * preserve-list inside the page or it is silently stripped on the redirect
 * and the prefill is lost. We've shipped enough founder + accountant prefill
 * params (startup_stage, drawer, benchmark_contribution) to lock this list
 * down with a positive test — adding a new contract param without updating
 * the preserve-list will fail this test.
 */
describe('venus /reports/new redirect', () => {
  beforeEach(() => {
    redirectMock.mockClear()
    generateReportIdMock.mockClear()
  })

  function callRedirect(): string {
    expect(redirectMock).toHaveBeenCalledTimes(1)
    const arg = redirectMock.mock.calls[0]?.[0]
    expect(typeof arg).toBe('string')
    return arg as string
  }

  it('preserves the full Mercury → engine prefill contract on redirect', async () => {
    await NewReportPage({
      params: Promise.resolve({ locale: 'nl' }),
      searchParams: Promise.resolve({
        prefilledQuery: 'ACME BV 0123456789 Algemene supermarkten',
        clientToken: 'tok_abc',
        clientId: 'client-123',
        flow: 'manual',
        mode: 'edit',
        source: 'business_dashboard_orphaned_seller',
        return_url: 'https://app.upswitch.app/nl',
        guestSessionId: 'guest_xyz',
        embedded: 'true',
        drawer: 'open',
        spotlight: '1',
        focusField: 'ebitda',
        flagYear: '2024',
        selected_method: 'upswitch_adaptive',
        startup_stage: 'seed',
        benchmark_contribution: '0',
        action: 'download',
        tab: 'history',
      }),
    })

    const target = callRedirect()
    expect(target.startsWith('/nl/reports/rep_test_id_xxxxxx?')).toBe(true)

    const search = new URLSearchParams(target.split('?')[1] ?? '')
    expect(search.get('prefilledQuery')).toBe(
      'ACME BV 0123456789 Algemene supermarkten',
    )
    expect(search.get('clientToken')).toBe('tok_abc')
    expect(search.get('clientId')).toBe('client-123')
    expect(search.get('flow')).toBe('manual')
    expect(search.get('mode')).toBe('edit')
    expect(search.get('source')).toBe('business_dashboard_orphaned_seller')
    expect(search.get('return_url')).toBe('https://app.upswitch.app/nl')
    expect(search.get('guestSessionId')).toBe('guest_xyz')
    expect(search.get('embedded')).toBe('true')
    expect(search.get('drawer')).toBe('open')
    expect(search.get('spotlight')).toBe('1')
    expect(search.get('focusField')).toBe('ebitda')
    expect(search.get('flagYear')).toBe('2024')
    expect(search.get('selected_method')).toBe('upswitch_adaptive')
    expect(search.get('startup_stage')).toBe('seed')
    expect(search.get('benchmark_contribution')).toBe('0')
    expect(search.get('action')).toBe('download')
    expect(search.get('tab')).toBe('history')
  })

  it('drops unknown params (no leak surface for arbitrary user-controlled query)', async () => {
    await NewReportPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({
        prefilledQuery: 'ACME',
        utm_campaign: 'spring',
        attacker_payload: '<script>alert(1)</script>',
      }),
    })

    const target = callRedirect()
    const search = new URLSearchParams(target.split('?')[1] ?? '')
    expect(search.get('prefilledQuery')).toBe('ACME')
    expect(search.has('utm_campaign')).toBe(false)
    expect(search.has('attacker_payload')).toBe(false)
  })

  it('redirects with no query string when no preserved params are present', async () => {
    await NewReportPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    })

    const target = callRedirect()
    expect(target).toBe('/en/reports/rep_test_id_xxxxxx')
  })

  it('preserves the founder dashboard CTA prefill (startup_stage + selected_method=startup_valuation + prefilledQuery)', async () => {
    await NewReportPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({
        flow: 'manual',
        selected_method: 'startup_valuation',
        source: 'client_dashboard',
        prefilledQuery: 'My Startup',
        startup_stage: 'pre_seed',
      }),
    })

    const target = callRedirect()
    const search = new URLSearchParams(target.split('?')[1] ?? '')
    expect(search.get('selected_method')).toBe('startup_valuation')
    expect(search.get('startup_stage')).toBe('pre_seed')
    expect(search.get('prefilledQuery')).toBe('My Startup')
    expect(search.get('flow')).toBe('manual')
    expect(search.get('source')).toBe('client_dashboard')
  })
})
