import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useClientContext } from '../../stores/clientContext'
import type { ValuationResponse, ValuationSession } from '../../types/valuation'
import { saveCompleteValuationSession } from './SessionCompleteSaveService'

const mocks = vi.hoisted(() => ({
  broadcastReportUpdated: vi.fn(),
  saveValuationResult: vi.fn().mockResolvedValue({ reportId: 'saved-report-id' }),
  promoteSavedReportIdentity: vi.fn().mockReturnValue({
    reportId: '44444444-4444-4444-8444-444444444444',
    sessionKey: 'val_range_restore',
  }),
  updateValuationSession: vi.fn().mockResolvedValue({ success: true }),
  cacheGet: vi.fn(),
  cacheRemove: vi.fn(),
  cacheSet: vi.fn(),
}))

vi.mock('../api/session/SessionAPI', () => ({
  SessionAPI: class {
    saveValuationResult = mocks.saveValuationResult
  },
}))

vi.mock('../backendApi', () => ({
  backendAPI: {
    updateValuationSession: mocks.updateValuationSession,
  },
}))

vi.mock('../../utils/sessionCacheManager', () => ({
  globalSessionCache: {
    get: mocks.cacheGet,
    remove: mocks.cacheRemove,
    set: mocks.cacheSet,
  },
}))

vi.mock('../../utils/reportIdentityPromotion', () => ({
  promoteSavedReportIdentity: mocks.promoteSavedReportIdentity,
}))

vi.mock('../../utils/auth/cross-domain-logout', () => ({
  broadcastReportUpdated: mocks.broadcastReportUpdated,
}))

vi.mock('../../store/useVersionHistoryStore', () => ({
  useVersionHistoryStore: {
    getState: () => ({
      versions: { val_range_restore: [] },
      getLatestVersion: () => null,
    }),
  },
}))

describe('saveCompleteValuationSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('window', {})
    useClientContext.setState({ isActingAsClient: false, relationshipId: null })
  })

  it.each([
    'switch',
    'switch-back',
  ])('does not promote, reload, cache or broadcast an old save after a client %s', async (change) => {
    let resolve!: (response: object) => void
    mocks.saveValuationResult.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolve = res
        })
    )
    const loadSession = vi.fn()
    const save = saveCompleteValuationSession(
      'report-a',
      { valuationResult: { valuation_id: 'val_a' } },
      loadSession
    )
    await vi.waitFor(() => expect(mocks.saveValuationResult).toHaveBeenCalledTimes(1))
    useClientContext.setState({ isActingAsClient: true, relationshipId: 'client-b' })
    if (change === 'switch-back')
      useClientContext.setState({ isActingAsClient: false, relationshipId: null })
    resolve({ reportId: 'report-a' })
    await save
    expect(mocks.promoteSavedReportIdentity).not.toHaveBeenCalled()
    expect(loadSession).not.toHaveBeenCalled()
    expect(mocks.cacheSet).not.toHaveBeenCalled()
    expect(mocks.cacheRemove).not.toHaveBeenCalled()
    expect(mocks.broadcastReportUpdated).not.toHaveBeenCalled()
  })

  it.each([
    'resolve',
    'reject',
  ])('does not restore cache or broadcast if scope changes during a reload that will %s', async (outcome) => {
    let resolve!: (session: ValuationSession) => void
    let reject!: (error: Error) => void
    const loadSession = vi.fn(
      () =>
        new Promise<ValuationSession>((res, rej) => {
          resolve = res
          reject = rej
        })
    )
    mocks.cacheGet.mockReturnValueOnce({ reportId: 'report-a', name: 'Old cached report' })
    const save = saveCompleteValuationSession(
      'report-a',
      { valuationResult: { valuation_id: 'val_a' } },
      loadSession
    )
    await vi.waitFor(() => expect(loadSession).toHaveBeenCalledTimes(1))
    useClientContext.setState({ isActingAsClient: true, relationshipId: 'client-b' })
    if (outcome === 'resolve')
      resolve({ reportId: 'report-a', name: 'Old report' } as ValuationSession)
    else reject(new Error('timeout'))
    await save
    expect(mocks.cacheSet).not.toHaveBeenCalled()
    expect(mocks.broadcastReportUpdated).not.toHaveBeenCalled()
  })

  it('sends the original inputs and result in one save even if the caller edits them while saving', async () => {
    const data = {
      formData: { company_name: 'Original company', business_type_weights: { accounting: 100 } },
      valuationResult: { valuation_id: 'val_original', equity_value_mid: 42 },
      htmlReport: '<main>Original</main>',
    }
    const save = saveCompleteValuationSession('report-a', data, async () => null)
    data.formData.company_name = 'New company'
    data.formData.business_type_weights.accounting = 20
    data.valuationResult.equity_value_mid = 99
    data.htmlReport = '<main>New</main>'
    await save
    expect(mocks.updateValuationSession).not.toHaveBeenCalled()
    expect(mocks.saveValuationResult).toHaveBeenCalledWith(
      'report-a',
      expect.objectContaining({
        sessionData: expect.objectContaining({
          company_name: 'Original company',
          business_type_weights: { accounting: 100 },
        }),
        valuationResult: { valuation_id: 'val_original', equity_value_mid: 42 },
        htmlReport: '<main>Original</main>',
      })
    )
    expect(mocks.broadcastReportUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        valuationResult: expect.objectContaining({ equity_value_mid: 42 }),
      })
    )
  })

  it('rejects a save cancelled before transport rather than acknowledging it as persisted', async () => {
    const save = saveCompleteValuationSession(
      'report-a',
      { valuationResult: { valuation_id: 'val_a' } },
      vi.fn()
    )
    useClientContext.setState({ isActingAsClient: true, relationshipId: 'client-b' })
    await expect(save).rejects.toMatchObject({ code: 'SESSION_SAVE_COMPLETE_CANCELLED' })
    expect(mocks.saveValuationResult).not.toHaveBeenCalled()
    expect(mocks.updateValuationSession).not.toHaveBeenCalled()
  })

  it('broadcasts the saved zero midpoint and asking price without synthesizing a price', async () => {
    const valuationResult = {
      valuation_id: 'val_range_restore',
      equity_value_low: 12_800_000,
      equity_value_mid: 0,
      equity_value_high: 18_400_000,
      recommended_asking_price: 0,
      confidence_score: 0.8,
      methodology: 'hybrid',
    } satisfies Partial<ValuationResponse>

    await saveCompleteValuationSession(
      'val_range_restore',
      { valuationResult },
      async () =>
        ({
          reportId: 'val_range_restore',
          name: 'Range BV',
        }) as ValuationSession
    )

    expect(mocks.broadcastReportUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: '44444444-4444-4444-8444-444444444444',
        reportName: 'Range BV',
        valuationResult: expect.objectContaining({
          equity_value_low: 12_800_000,
          equity_value_mid: 0,
          equity_value_high: 18_400_000,
          recommended_asking_price: 0,
          confidence_score: 0.8,
          methodology: 'hybrid',
        }),
      })
    )
  })

  it('restores the canonical cache when the post-save reload throws', async () => {
    const previousSession = {
      reportId: 'val_range_restore',
      name: 'Range BV',
    } as ValuationSession
    mocks.cacheGet.mockReturnValueOnce(previousSession)

    await saveCompleteValuationSession(
      'val_range_restore',
      {
        valuationResult: {
          valuation_id: 'val_engine_run',
          equity_value_mid: 15_600_000,
        },
      },
      async () => {
        throw new Error('temporary reload failure')
      }
    )

    expect(mocks.cacheRemove).toHaveBeenCalledWith('44444444-4444-4444-8444-444444444444')
    expect(mocks.cacheSet).toHaveBeenCalledWith(
      '44444444-4444-4444-8444-444444444444',
      previousSession
    )
  })

  it('persists the full weighted business type mix on complete save', async () => {
    await saveCompleteValuationSession(
      'val_multi_type',
      {
        formData: {
          company_name: 'Venus Advisory BV',
          business_type_id: 'accounting',
          business_type_segments: [
            { business_type_id: 'accounting', business_type_title: 'Accounting', weight: 65 },
            { business_type_id: 'tax-advisory', business_type_title: 'Tax Advisory', weight: 35 },
          ],
          business_type_mix: [
            { business_type_id: 'accounting', business_type_title: 'Accounting', weight: 65 },
            { business_type_id: 'tax-advisory', business_type_title: 'Tax Advisory', weight: 35 },
          ],
          business_type_weights: {
            accounting: 65,
            'tax-advisory': 35,
          },
        },
      },
      async () =>
        ({
          reportId: 'val_multi_type',
          name: 'Venus Advisory BV',
        }) as ValuationSession
    )

    expect(mocks.updateValuationSession).toHaveBeenCalledWith(
      'val_multi_type',
      {
        sessionData: expect.objectContaining({
          business_type_id: 'accounting',
          business_type_segments: [
            { business_type_id: 'accounting', business_type_title: 'Accounting', weight: 65 },
            { business_type_id: 'tax-advisory', business_type_title: 'Tax Advisory', weight: 35 },
          ],
          business_type_mix: [
            { business_type_id: 'accounting', business_type_title: 'Accounting', weight: 65 },
            { business_type_id: 'tax-advisory', business_type_title: 'Tax Advisory', weight: 35 },
          ],
          business_type_weights: {
            accounting: 65,
            'tax-advisory': 35,
          },
        }),
      },
      expect.any(Object)
    )
  })

  it('derives business type mix and weights from weighted segments on complete save', async () => {
    await saveCompleteValuationSession(
      'val_segments_only',
      {
        formData: {
          company_name: 'Segments Only BV',
          business_type_id: 'accounting',
          business_type_segments: [
            { business_type_id: 'accounting ', business_type_title: 'Accounting', weight: '65' },
            { business_type_id: 'tax-advisory', business_type_title: 'Tax Advisory', weight: 35 },
          ],
        },
      },
      async () =>
        ({
          reportId: 'val_segments_only',
          name: 'Segments Only BV',
        }) as ValuationSession
    )

    const normalizedSegments = [
      { business_type_id: 'accounting', business_type_title: 'Accounting', weight: 65 },
      { business_type_id: 'tax-advisory', business_type_title: 'Tax Advisory', weight: 35 },
    ]

    expect(mocks.updateValuationSession).toHaveBeenCalledWith(
      'val_segments_only',
      {
        sessionData: expect.objectContaining({
          business_type_segments: normalizedSegments,
          business_type_mix: normalizedSegments,
          business_type_weights: {
            accounting: 65,
            'tax-advisory': 35,
          },
        }),
      },
      expect.any(Object)
    )
  })

  it('falls back to business type mix when complete-save segments are empty', async () => {
    await saveCompleteValuationSession(
      'val_empty_segments_mix',
      {
        formData: {
          company_name: 'Mix Fallback BV',
          business_type_id: 'accounting',
          business_type_segments: [],
          business_type_mix: [
            { business_type_id: 'accounting', business_type_title: 'Accounting', weight: 65 },
            { business_type_id: 'tax-advisory', business_type_title: 'Tax Advisory', weight: 35 },
          ],
        },
      },
      async () =>
        ({
          reportId: 'val_empty_segments_mix',
          name: 'Mix Fallback BV',
        }) as ValuationSession
    )

    const normalizedSegments = [
      { business_type_id: 'accounting', business_type_title: 'Accounting', weight: 65 },
      { business_type_id: 'tax-advisory', business_type_title: 'Tax Advisory', weight: 35 },
    ]

    expect(mocks.updateValuationSession).toHaveBeenCalledWith(
      'val_empty_segments_mix',
      {
        sessionData: expect.objectContaining({
          business_type_segments: normalizedSegments,
          business_type_mix: normalizedSegments,
          business_type_weights: {
            accounting: 65,
            'tax-advisory': 35,
          },
        }),
      },
      expect.any(Object)
    )
  })
})
