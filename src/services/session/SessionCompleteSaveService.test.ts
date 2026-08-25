import { beforeEach, describe, expect, it, vi } from 'vitest'

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

vi.mock('../../stores/clientContext', () => ({
  useClientContext: {
    getState: () => ({
      isActingAsClient: false,
      relationshipId: null,
    }),
  },
}))

describe('saveCompleteValuationSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('window', {})
  })

  it('broadcasts a positive midpoint when the saved result has zero midpoint and asking price', async () => {
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
          equity_value_mid: 15_600_000,
          equity_value_high: 18_400_000,
          recommended_asking_price: 15_600_000,
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
