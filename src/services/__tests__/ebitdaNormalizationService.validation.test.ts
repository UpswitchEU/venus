import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type CreateNormalizationRequest,
  type GetNormalizationResponse,
  NormalizationCategory,
} from '../../types/ebitdaNormalization'
import { EbitdaNormalizationService, NormalizationAPIError } from '../ebitdaNormalizationService'

function validSavePayload(): CreateNormalizationRequest {
  return {
    session_id: 'val_sess_ab12',
    year: 2024,
    reported_ebitda: 100_000,
    adjustments: [{ category: NormalizationCategory.OWNER_COMPENSATION, amount: -5000 }],
  }
}

describe('EbitdaNormalizationService client-side validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('getNormalization rejects before fetch when session_id is too short', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const svc = new EbitdaNormalizationService()
    await expect(svc.getNormalization('tiny', 2024)).rejects.toThrow(NormalizationAPIError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('getNormalization rejects before fetch when session_id is the reserved word new', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const svc = new EbitdaNormalizationService()
    await expect(svc.getNormalization('new', 2024)).rejects.toThrow(NormalizationAPIError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('getNormalization rejects before fetch when year is out of Titan range', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const svc = new EbitdaNormalizationService()
    await expect(svc.getNormalization('val_sess_ab12', 1888)).rejects.toThrow(NormalizationAPIError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('deleteNormalization rejects before fetch when session_id is too short', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const svc = new EbitdaNormalizationService()
    await expect(svc.deleteNormalization('bad', 2024)).rejects.toThrow(NormalizationAPIError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('getAllNormalizations rejects before fetch when session_id is too long', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const svc = new EbitdaNormalizationService()
    const tooLong = 'a'.repeat(129)
    await expect(svc.getAllNormalizations(tooLong)).rejects.toThrow(NormalizationAPIError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('getMarketRates rejects before fetch when industry is blank', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const svc = new EbitdaNormalizationService()
    await expect(svc.getMarketRates('  ')).rejects.toThrow(NormalizationAPIError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('saveNormalization rejects before fetch when reported_ebitda is not finite', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const svc = new EbitdaNormalizationService()
    await expect(
      svc.saveNormalization({ ...validSavePayload(), reported_ebitda: Number.NaN })
    ).rejects.toThrow(NormalizationAPIError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('saveNormalization rejects before fetch when adjustments is a non-array', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const svc = new EbitdaNormalizationService()
    await expect(
      svc.saveNormalization({ ...validSavePayload(), adjustments: 'nope' as unknown as [] })
    ).rejects.toThrow(NormalizationAPIError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('saveNormalization rejects before fetch when an adjustment amount is not finite', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const svc = new EbitdaNormalizationService()
    await expect(
      svc.saveNormalization({
        ...validSavePayload(),
        adjustments: [
          { category: NormalizationCategory.OWNER_COMPENSATION, amount: Number.POSITIVE_INFINITY },
        ],
      })
    ).rejects.toThrow(NormalizationAPIError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('saveNormalization calls fetch once for a valid payload', async () => {
    const body: GetNormalizationResponse = {
      id: 'norm-1',
      version_id: null,
      year: 2024,
      reported_ebitda: 100_000,
      adjustments: [],
      custom_adjustments: [],
      total_adjustments: 0,
      normalized_ebitda: 100_000,
      confidence_score: 'medium',
      market_rate_source: null,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const svc = new EbitdaNormalizationService()
    const out = await svc.saveNormalization(validSavePayload())
    expect(out.id).toBe('norm-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.method).toBe('POST')
    const posted = JSON.parse(String(init?.body))
    expect(posted.session_id).toBe('val_sess_ab12')
  })
})
