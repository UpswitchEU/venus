import { describe, expect, it, vi } from 'vitest'

const redirectMock = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

import CalculatePage from './page'

describe('venus /[locale]/calculate redirect', () => {
  it('forwards allowlisted bootstrap params to /reports/new (parity with /calculator)', async () => {
    await CalculatePage({
      params: Promise.resolve({ locale: 'nl' }),
      searchParams: Promise.resolve({
        source: 'mercury',
        clientId: 'rel_1',
        prefilledQuery: 'Acme',
        token: 'exchange_tok',
      }),
    })

    expect(redirectMock).toHaveBeenCalledWith(
      '/nl/reports/new?prefilledQuery=Acme&token=exchange_tok&clientId=rel_1&source=mercury',
    )
  })

  it('redirects bare path to /reports/new', async () => {
    await CalculatePage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    })
    expect(redirectMock).toHaveBeenCalledWith('/en/reports/new')
  })
})
