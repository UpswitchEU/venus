import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizationItem } from '../../../components/calculator'
import { normalizationService } from '../../../services/ebitdaNormalizationService'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { useManualNormalizationReviewActions } from './useManualNormalizationReviewActions'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/lib/analytics', () => ({ trackAINormalizationAccept: vi.fn() }))
vi.mock('../../../utils/normalizationPersist', () => ({
  persistOrDeleteNormalizationsForYears: vi.fn(),
}))

const item: NormalizationItem = {
  id: 'imported-2025-610000',
  ledgerCode: '610000',
  ledgerName: 'Services and other goods',
  category: 'other',
  type: 'add',
  value: 125_000,
  adjustment: 25_000,
  reason: 'Synthetic imported proposal',
  source: 'auto',
  sourceRef: '2025:610000',
  status: 'pending',
  applyAllYears: false,
  year: 2025,
  confidence: 'high',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function renderActions(recalculate = vi.fn().mockResolvedValue(undefined)) {
  const store = useNormalizationStore.getState()
  const normalizationActions = {
    acceptItem: (id: string) => useNormalizationStore.getState().acceptItem(id),
    rejectItem: (id: string) => useNormalizationStore.getState().rejectItem(id),
    updateItem: (id: string, updates: Partial<NormalizationItem>) =>
      useNormalizationStore.getState().updateItem(id, updates),
  }
  const setSuggestedNormalisations = vi.fn()
  const hook = renderHook(() =>
    useManualNormalizationReviewActions({
      reportId: 'val_1787500000000_advisor_normalization_test',
      normalizationActions,
      setSuggestedNormalisations,
      financialYears: [2025],
      originalEBITDAByYear: { 2025: 100_000 },
      recalculateWithNormalizations: recalculate,
      persistFailedTitle: 'Not saved',
      persistFailedDescription: 'Retry',
    })
  )
  return { ...hook, store, recalculate, setSuggestedNormalisations }
}

describe('useManualNormalizationReviewActions rejection acknowledgement', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useNormalizationStore.getState().clear()
    useNormalizationStore.getState().setItems([{ ...item }])
  })

  it('does not show rejected until Titan acknowledges the dossier-scoped decision', async () => {
    const acknowledgement =
      deferred<Awaited<ReturnType<typeof normalizationService.rememberRejection>>>()
    vi.spyOn(normalizationService, 'rememberRejection').mockReturnValue(acknowledgement.promise)
    const { result } = renderActions()

    let action!: Promise<void>
    act(() => {
      action = result.current.handleRejectNormalisation(item.id)
    })
    expect(useNormalizationStore.getState().items[0]?.status).toBe('pending')

    acknowledgement.resolve({
      schema_version: 'normalization_decision.v1',
      id: 'decision-1',
      proposal_fingerprint: 'a'.repeat(64),
      scope: 'client',
      decision: 'reject',
      idempotency_key: 'idempotency-1',
      created_at: '2026-08-23T12:00:00Z',
      revoked_at: null,
    })
    await act(async () => action)

    expect(useNormalizationStore.getState().items[0]?.status).toBe('rejected')
  })

  it('keeps the proposal visibly pending when decision persistence fails', async () => {
    vi.spyOn(normalizationService, 'rememberRejection').mockRejectedValue(
      new Error('decision unavailable')
    )
    const { result, recalculate } = renderActions()

    await act(async () => result.current.handleRejectNormalisation(item.id))

    expect(useNormalizationStore.getState().items[0]?.status).toBe('pending')
    expect(recalculate).not.toHaveBeenCalled()
  })

  it('treats the acknowledged rejection as the only required save before recalculation', async () => {
    const remember = vi.spyOn(normalizationService, 'rememberRejection').mockResolvedValue({
      schema_version: 'normalization_decision.v1',
      id: 'decision-1',
      proposal_fingerprint: 'a'.repeat(64),
      scope: 'client',
      decision: 'reject',
      idempotency_key: 'idempotency-1',
      created_at: '2026-08-23T12:00:00Z',
      revoked_at: null,
    })
    const { result, recalculate } = renderActions()

    await act(async () => result.current.handleRejectNormalisation(item.id))

    expect(remember).toHaveBeenCalledWith(
      'val_1787500000000_advisor_normalization_test',
      expect.objectContaining({ ledgerCode: '610000', fiscalYear: 2025 })
    )
    expect(useNormalizationStore.getState().items[0]?.status).toBe('rejected')
    expect(recalculate).toHaveBeenCalledWith([
      expect.objectContaining({ id: item.id, status: 'rejected' }),
    ])
  })
})
