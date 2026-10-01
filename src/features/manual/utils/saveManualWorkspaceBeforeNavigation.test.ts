import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  saveManualWorkspaceBeforeNavigation,
  WorkspaceSaveNotReadyError,
} from './saveManualWorkspaceBeforeNavigation'

const env = vi.hoisted(() => ({
  state: {} as any,
  form: { company_name: 'A' },
  norms: [] as any[],
  tax: [] as any[],
  recover: vi.fn(),
  update: vi.fn(),
  save: vi.fn(),
  flush: vi.fn(),
  failed: vi.fn(),
  pending: vi.fn(),
  current: true,
  busy: false,
}))
vi.mock('../../../store/useSessionStore', () => ({
  useSessionStore: { getState: () => env.state },
}))
vi.mock('../../../store/manual/useManualFormStore', () => ({
  useManualFormStore: { getState: () => ({ formData: env.form }) },
}))
vi.mock('../../../store/useNormalizationStore', () => ({
  useNormalizationStore: { getState: () => ({ items: env.norms }) },
}))
vi.mock('../../../store/useTaxLatencyStore', () => ({
  useTaxLatencyStore: { getState: () => ({ items: env.tax }) },
}))
vi.mock('../../../services/report/ReportAssetService', () => ({
  reportAssetService: { retryFailedSave: env.recover },
  failedReportAssetSave: env.failed,
  pendingReportAssetSave: env.pending,
}))
vi.mock('../../../utils/reportIdentityPromotion', () => ({
  isSameReportIdentity: (a: unknown, b: unknown) => a === b,
}))
const run = () =>
  saveManualWorkspaceBeforeNavigation({
    flushForm: env.flush,
    isCurrent: () => env.current,
    isBusy: () => env.busy,
  })

beforeEach(() => {
  vi.resetAllMocks()
  env.current = true
  env.busy = false
  env.norms = []
  env.tax = []
  env.form = { company_name: 'A' }
  env.state = {
    engine: {},
    engineRevision: 1,
    session: { reportId: 'report-a', sessionData: {} },
    hasUnsavedChanges: false,
    isSaving: false,
    saveErrorMessage: null,
    updateSessionData: env.update,
    saveSession: env.save,
  }
  env.recover.mockResolvedValue(false)
  env.flush.mockResolvedValue(undefined)
  env.update.mockImplementation(async () => {
    env.state.hasUnsavedChanges = true
  })
  env.save.mockImplementation(async () => {
    env.state.hasUnsavedChanges = false
  })
})

afterEach(() => vi.useRealTimers())

describe('workspace save before navigation', () => {
  it('waits for calculation or method work to finish before saving and departing', async () => {
    vi.useFakeTimers()
    env.busy = true
    const work = run()
    expect(env.recover).not.toHaveBeenCalled()
    env.busy = false
    await vi.advanceTimersByTimeAsync(100)
    await work
    expect(env.flush).toHaveBeenCalledOnce()
  })
  it('recovers the result before flushing newer form edits and avoids redundant draft writes', async () => {
    const order: string[] = []
    env.recover.mockImplementation(async () => {
      order.push('result')
    })
    env.flush.mockImplementation(async () => {
      order.push('form')
    })
    await run()
    expect(order).toEqual(['result', 'form'])
    expect(env.update).not.toHaveBeenCalled()
    expect(env.save).not.toHaveBeenCalled()
  })
  it('saves normalization edits that still sit in their separate debounce queue', async () => {
    env.norms = [{ id: 'adjustment-a', status: 'accepted', adjustment: 12000 }]
    await run()
    expect(env.update).toHaveBeenCalledWith(expect.objectContaining({ _normalizations: env.norms }))
    expect(env.save).toHaveBeenCalledWith('user')
  })
  it.each([
    'missing-engine',
    'busy',
    'form-failure',
    'context-change',
    'dirty',
    'resolved-error',
    'result-failure',
    'new-edit',
  ])('blocks departure for %s', async (kind) => {
    if (kind === 'missing-engine') env.state.engine = null
    if (kind === 'busy')
      env.flush.mockImplementationOnce(async () => {
        env.busy = true
      })
    if (kind === 'form-failure') env.flush.mockRejectedValueOnce(new Error('offline'))
    if (kind === 'context-change')
      env.recover.mockImplementationOnce(async () => {
        env.current = false
      })
    if (kind === 'result-failure') env.failed.mockReturnValue({ error: 'offline' })
    if (['dirty', 'resolved-error', 'new-edit'].includes(kind)) {
      env.state.hasUnsavedChanges = true
      env.save.mockImplementationOnce(async () => {
        if (kind === 'resolved-error') env.state.saveErrorMessage = 'offline'
        if (kind === 'new-edit') {
          env.state.hasUnsavedChanges = false
          env.form = { company_name: 'Changed' }
        }
      })
    }
    await expect(run()).rejects.toThrow(kind === 'busy' ? WorkspaceSaveNotReadyError : Error)
    if (kind === 'context-change') expect(env.flush).not.toHaveBeenCalled()
  })
  it('does not write a different report after a slow form flush', async () => {
    env.flush.mockImplementationOnce(async () => {
      env.state = { ...env.state, engine: {}, engineRevision: 2, session: { reportId: 'report-b' } }
    })
    await expect(run()).rejects.toThrow('changed')
    expect(env.update).not.toHaveBeenCalled()
    expect(env.save).not.toHaveBeenCalled()
  })
})
