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

import { accountingAPI, pickConnectedImportStatus, pickConnectedVenusBatchImportStatus } from '../accounting'

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

  it('requests the prior year once the April filing cutoff has passed', async () => {
    vi.setSystemTime(new Date('2026-04-01T12:00:00Z'))

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

  it('requests Octopus multi-year batch with company_id', async () => {
    mockGet.mockResolvedValueOnce({ data: { years: [] } })

    await accountingAPI.getOctopusFinancialDataBatch(2021, 2025, { companyId: 'dossier-42' })

    expect(mockGet).toHaveBeenCalledWith('/integrations/accounting/octopus/financial-data/batch', {
      params: {
        start_year: 2021,
        end_year: 2025,
        company_id: 'dossier-42',
      },
    })
  })
})

describe('accounting import provider selection', () => {
  it('pickConnectedImportStatus prefers Silverfin over Octopus when both are connected', () => {
    const row = pickConnectedImportStatus([
      { provider: 'octopus', is_connected: true },
      { provider: 'silverfin', is_connected: true },
    ])
    expect(row?.provider).toBe('silverfin')
  })

  it('pickConnectedImportStatus returns Octopus when it is the only connected import provider', () => {
    const row = pickConnectedImportStatus([
      { provider: 'yuki', is_connected: false },
      { provider: 'octopus', is_connected: true },
    ])
    expect(row?.provider).toBe('octopus')
  })

  it('pickConnectedImportStatus prefers Bizzcontrol over Octopus when both are connected', () => {
    const row = pickConnectedImportStatus([
      { provider: 'octopus', is_connected: true },
      { provider: 'bizzcontrol', is_connected: true },
    ])
    expect(row?.provider).toBe('bizzcontrol')
  })
})

describe('pickConnectedVenusBatchImportStatus (Venus modal import)', () => {
  it('prefers Bizzcontrol over Octopus when both are connected', () => {
    const row = pickConnectedVenusBatchImportStatus([
      { provider: 'octopus', is_connected: true },
      { provider: 'bizzcontrol', is_connected: true },
    ])
    expect(row?.provider).toBe('bizzcontrol')
  })

  it('returns Bizzcontrol when Silverfin is also connected (unlike global picker)', () => {
    const venusRow = pickConnectedVenusBatchImportStatus([
      { provider: 'silverfin', is_connected: true },
      { provider: 'bizzcontrol', is_connected: true },
    ])
    const globalRow = pickConnectedImportStatus([
      { provider: 'silverfin', is_connected: true },
      { provider: 'bizzcontrol', is_connected: true },
    ])
    expect(globalRow?.provider).toBe('silverfin')
    expect(venusRow?.provider).toBe('bizzcontrol')
  })

  it('returns Octopus when it is the only Venus batch provider connected', () => {
    const row = pickConnectedVenusBatchImportStatus([
      { provider: 'silverfin', is_connected: true },
      { provider: 'octopus', is_connected: true },
    ])
    expect(row?.provider).toBe('octopus')
  })

  it('returns null when only Silverfin is connected', () => {
    expect(
      pickConnectedVenusBatchImportStatus([{ provider: 'silverfin', is_connected: true }])
    ).toBeNull()
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
