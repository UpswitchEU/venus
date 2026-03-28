import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
}))

vi.mock('../HttpClient', () => ({
  HttpClient: class {
    client = {
      get: mockGet,
    }
  },
}))

import { accountingAPI } from '../accounting'

describe('accountingAPI filing year defaults', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockGet.mockReset()
    mockGet.mockResolvedValue({
      data: {
        data: {
          revenue: 1_500_000,
          ebitda: 250_000,
          fiscal_year: 2024,
        },
        source: 'yuki',
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('requests the latest published filing year in March 2026', async () => {
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))

    await accountingAPI.getProviderFinancialData('yuki')

    expect(mockGet).toHaveBeenCalledWith('/integrations/accounting/yuki/financial-data', {
      params: { fiscal_year: 2024 },
    })
  })

  it('requests the prior year after the July filing cutoff', async () => {
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'))

    await accountingAPI.getProviderFinancialData('exact')

    expect(mockGet).toHaveBeenCalledWith('/integrations/accounting/exact/financial-data', {
      params: { fiscal_year: 2025 },
    })
  })

  it('honors an explicit fiscal year override', async () => {
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))

    await accountingAPI.getProviderFinancialData('yuki', 2022)

    expect(mockGet).toHaveBeenCalledWith('/integrations/accounting/yuki/financial-data', {
      params: { fiscal_year: 2022 },
    })
  })

  it('requests Silverfin multi-year batch with company_id', async () => {
    mockGet.mockResolvedValueOnce({ data: { years: [] } })

    await accountingAPI.getSilverfinFinancialDataBatch(2022, 2024, { companyId: 'dossier-1' })

    expect(mockGet).toHaveBeenCalledWith('/integrations/accounting/silverfin/financial-data/batch', {
      params: {
        start_year: 2022,
        end_year: 2024,
        company_id: 'dossier-1',
      },
    })
  })

  it('requests Bizzcontrol multi-year batch with company_id', async () => {
    mockGet.mockResolvedValueOnce({ data: { years: [] } })

    await accountingAPI.getBizzcontrolFinancialDataBatch(2023, 2025, { companyId: 'client-9' })

    expect(mockGet).toHaveBeenCalledWith('/integrations/accounting/bizzcontrol/financial-data/batch', {
      params: {
        start_year: 2023,
        end_year: 2025,
        company_id: 'client-9',
      },
    })
  })
})

describe('accountingAPI Silverfin authorize (fetch)', () => {
  it('includes OAuth state in the BFF URL when provided', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authorization_url: 'https://silverfin.example/oauth' }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    await accountingAPI.getSilverfinAuthorizeUrl('https://app.example/callback', 'firm-state-token')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(encodeURIComponent('https://app.example/callback'))
    expect(url).toContain('state=' + encodeURIComponent('firm-state-token'))

    vi.unstubAllGlobals()
  })

  it('disconnectSilverfin calls the BFF DELETE route', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    vi.stubGlobal('fetch', fetchSpy)

    await accountingAPI.disconnectSilverfin()

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/integrations/accounting/silverfin/disconnect',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' })
    )

    vi.unstubAllGlobals()
  })
})
