// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { backendAPI } from '../../../../services/backendApi'
import { useManualResultsStore } from '../../../../store/manual'
import { useSessionStore } from '../../../../store/useSessionStore'
import { restoreManualWorkspaceAfterDeleteFailure } from '../restoreManualWorkspaceAfterDeleteFailure'

vi.mock('../../../../services/backendApi', () => ({
  backendAPI: {
    getValuationSession: vi.fn(),
  },
}))

vi.mock('../manualReportHtmlRecoveryUtil', () => ({
  recoverManualReportHtmlIfNeeded: vi.fn(async ({ result }) => ({
    status: 'not_needed' as const,
    result,
  })),
}))

describe('restoreManualWorkspaceAfterDeleteFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSessionStore.getState().clearSession()
    useManualResultsStore.getState().clearResults()
  })

  it('restores result from in-memory session without refetch', async () => {
    useSessionStore.getState().hydrateSessionAndComplete({
      reportId: 'report-uuid',
      valuationResult: { valuation_id: 'report-uuid', equity_value_mid: 1_000_000 },
    } as never)

    const ok = await restoreManualWorkspaceAfterDeleteFailure({
      lookupIds: ['report-uuid'],
    })

    expect(ok).toBe(true)
    expect(useManualResultsStore.getState().result).toMatchObject({
      valuation_id: 'report-uuid',
      equity_value_mid: 1_000_000,
    })
    expect(backendAPI.getValuationSession).not.toHaveBeenCalled()
  })

  it('refetches session when store was cleared', async () => {
    vi.mocked(backendAPI.getValuationSession).mockResolvedValue({
      session: {
        reportId: 'report-uuid',
        valuationResult: { valuation_id: 'report-uuid', equity_value_mid: 500_000 },
      },
    } as never)

    const ok = await restoreManualWorkspaceAfterDeleteFailure({
      lookupIds: ['report-uuid'],
    })

    expect(ok).toBe(true)
    expect(backendAPI.getValuationSession).toHaveBeenCalledWith('report-uuid')
    expect(useSessionStore.getState().session?.reportId).toBe('report-uuid')
    expect(useManualResultsStore.getState().result).toMatchObject({ equity_value_mid: 500_000 })
  })

  it('returns false when no session can be loaded', async () => {
    vi.mocked(backendAPI.getValuationSession).mockResolvedValue(null)

    const ok = await restoreManualWorkspaceAfterDeleteFailure({
      lookupIds: ['missing-id'],
    })

    expect(ok).toBe(false)
    expect(useManualResultsStore.getState().result).toBeNull()
  })
})
