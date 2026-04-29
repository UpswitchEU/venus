/**
 * /reports/new — cross-app param preservation contract.
 *
 * The redirect at `/[locale]/reports/new` is the funnel for EVERY
 * inbound flow (Mercury KBO calculator, Studio v2 wizard, partner
 * landing pages, accountant invites, deep-link CTAs).  Any param read
 * by the report client at `/reports/[id]` MUST round-trip the redirect
 * verbatim — silently dropping a param means the report page boots
 * without the bootstrap context (KBO data, partner attribution, the
 * pre-selected method, …) and the user falls through to the generic
 * SME flow.
 *
 * The allowlist lives in `src/lib/cross-app/preservedReportBootstrapParams.ts`.
 * This regression test pins behavior so a future refactor can't drop a param.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

const redirectMock = vi.fn((url: string) => {
  // Next.js' `redirect()` throws to halt rendering; mirror that so the
  // page handler short-circuits like in production.
  const err = new Error('NEXT_REDIRECT') as Error & { digest: string }
  err.digest = `NEXT_REDIRECT;replace;${url};307;`
  throw err
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

vi.mock('../../../../src/utils/reportIdGenerator', () => ({
  generateReportId: () => 'test-report-id',
}))

import NewReportPage from './page'

async function callPage(searchParams: Record<string, string | string[] | undefined>) {
  redirectMock.mockClear()
  try {
    await NewReportPage({
      params: Promise.resolve({ locale: 'nl' }),
      searchParams: Promise.resolve(searchParams),
    })
  } catch (err) {
    // Swallow the simulated NEXT_REDIRECT — assertions read the mock.
    if (!(err instanceof Error) || err.message !== 'NEXT_REDIRECT') throw err
  }
  expect(redirectMock).toHaveBeenCalledOnce()
  return redirectMock.mock.calls[0]![0] as string
}

describe('/reports/new param preservation', () => {
  beforeEach(() => {
    redirectMock.mockClear()
  })

  it('redirects to a fresh report id under the requested locale', async () => {
    const url = await callPage({})
    expect(url).toBe('/nl/reports/test-report-id')
  })

  it('preserves Studio v2 attribution params (source, selected_method, partner)', async () => {
    const url = await callPage({
      source: 'studio_v2',
      selected_method: 'startup_valuation',
      partner: 'imec.istart',
    })
    const u = new URL(url, 'https://example.com')
    expect(u.pathname).toBe('/nl/reports/test-report-id')
    expect(u.searchParams.get('source')).toBe('studio_v2')
    expect(u.searchParams.get('selected_method')).toBe('startup_valuation')
    expect(u.searchParams.get('partner')).toBe('imec.istart')
  })

  it('preserves Mercury KBO bootstrap params (prefilledQuery, clientToken, clientId)', async () => {
    const url = await callPage({
      prefilledQuery: 'Acme Robotics BV',
      clientToken: 'tok_abc',
      clientId: 'rel_123',
    })
    const u = new URL(url, 'https://example.com')
    expect(u.searchParams.get('prefilledQuery')).toBe('Acme Robotics BV')
    expect(u.searchParams.get('clientToken')).toBe('tok_abc')
    expect(u.searchParams.get('clientId')).toBe('rel_123')
  })

  it('preserves import-review session_key (val_*) for Titan session linkage', async () => {
    const url = await callPage({
      clientId: 'rel_456',
      session_key: 'val_1700000000000_abc',
    })
    const u = new URL(url, 'https://example.com')
    expect(u.searchParams.get('clientId')).toBe('rel_456')
    expect(u.searchParams.get('session_key')).toBe('val_1700000000000_abc')
  })

  it('preserves flow=startup and studio=legacy (waarderen classic advisors link)', async () => {
    const url = await callPage({
      flow: 'startup',
      studio: 'legacy',
    })
    const u = new URL(url, 'https://example.com')
    expect(u.searchParams.get('flow')).toBe('startup')
    expect(u.searchParams.get('studio')).toBe('legacy')
  })

  it('preserves locale, version query hints when present', async () => {
    const url = await callPage({
      locale: 'nl',
      clientId: 'rel_9',
      version: '3',
    })
    const u = new URL(url, 'https://example.com')
    expect(u.searchParams.get('locale')).toBe('nl')
    expect(u.searchParams.get('clientId')).toBe('rel_9')
    expect(u.searchParams.get('version')).toBe('3')
  })

  it('preserves guided-resolution drawer params (drawer, spotlight, focusField, flagYear)', async () => {
    const url = await callPage({
      drawer: 'normalisation',
      spotlight: 'salary',
      focusField: 'owner_compensation',
      flagYear: '2024',
    })
    const u = new URL(url, 'https://example.com')
    expect(u.searchParams.get('drawer')).toBe('normalisation')
    expect(u.searchParams.get('spotlight')).toBe('salary')
    expect(u.searchParams.get('focusField')).toBe('owner_compensation')
    expect(u.searchParams.get('flagYear')).toBe('2024')
  })

  it('preserves the founder dashboard startup_stage hint', async () => {
    const url = await callPage({ startup_stage: 'seed' })
    expect(url).toContain('startup_stage=seed')
  })

  it('preserves benchmark_contribution opt-out', async () => {
    const url = await callPage({ benchmark_contribution: '0' })
    expect(url).toContain('benchmark_contribution=0')
  })

  it('URL-encodes values with special characters', async () => {
    const url = await callPage({ prefilledQuery: 'Acme & Co./Ltd' })
    expect(url).toContain('prefilledQuery=Acme%20%26%20Co.%2FLtd')
  })

  it('drops params not on the allow-list (e.g. utm_*, arbitrary keys)', async () => {
    const url = await callPage({
      utm_source: 'twitter',
      arbitrary_param: 'should-be-stripped',
    })
    expect(url).not.toContain('utm_source')
    expect(url).not.toContain('arbitrary_param')
  })

  it('handles array-valued params by taking the first entry', async () => {
    const url = await callPage({ source: ['studio_v2', 'mercury'] })
    const u = new URL(url, 'https://example.com')
    expect(u.searchParams.get('source')).toBe('studio_v2')
  })

  it('preserves selected_method=startup_valuation when shipped alone', async () => {
    // Critical: this is the cross-app contract that switches the report
    // page from the SME default (`upswitch_adaptive`) to the venture
    // engine without requiring the wizard to be in the URL chain.
    const url = await callPage({ selected_method: 'startup_valuation' })
    expect(url).toContain('selected_method=startup_valuation')
  })

  it('does NOT add a query string when no preserved params are present', async () => {
    const url = await callPage({})
    expect(url).toBe('/nl/reports/test-report-id')
  })
})
