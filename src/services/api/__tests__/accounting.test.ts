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
})
