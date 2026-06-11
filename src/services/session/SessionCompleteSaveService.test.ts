import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ValuationResponse, ValuationSession } from '../../types/valuation'
import { saveCompleteValuationSession } from './SessionCompleteSaveService'

const mocks = vi.hoisted(() => ({
  broadcastReportUpdated: vi.fn(),
  saveValuationResult: vi.fn().mockResolvedValue(undefined),
  updateValuationSession: vi.fn().mockResolvedValue({ success: true }),
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
    remove: mocks.cacheRemove,
    set: mocks.cacheSet,
  },
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
        reportId: 'val_range_restore',
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
})
