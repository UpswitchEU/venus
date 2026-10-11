import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  recordSuccessfulSessionPatch,
  resetSessionPoolPressureCircuitForTests,
} from '../hooks/sessionPoolPressureCircuit'
import { useNormalizationStore } from './useNormalizationStore'
import { useSessionStore } from './useSessionStore'

const reportId = 'val_1791716671542_recovery'
const originalSession = useSessionStore.getState()
const originalNormalizations = useNormalizationStore.getState()
const saveSession = vi.fn()
const updateSessionData = vi.fn()

beforeEach(() => {
  resetSessionPoolPressureCircuitForTests()
  saveSession.mockReset().mockResolvedValue({ status: 'acknowledged' })
  updateSessionData.mockReset().mockResolvedValue(undefined)
  useSessionStore.setState({
    session: { reportId, sessionData: {} } as never,
    status: 'loaded',
    restorationComplete: true,
    hasUnsavedChanges: false,
    isSaving: false,
    saveFailure: null,
    saveSession,
    updateSessionData,
  })
  useNormalizationStore.setState({
    items: [],
    pendingMutations: [],
    recoveryBuffered: true,
  })
})

afterEach(() => {
  resetSessionPoolPressureCircuitForTests()
  useSessionStore.setState(originalSession, true)
  useNormalizationStore.setState(originalNormalizations, true)
})

describe('explicit normalization recovery', () => {
  it('drains a buffer after the preceding form save starts the autosave quiet window', async () => {
    recordSuccessfulSessionPatch()
    const persist = useNormalizationStore.getState().persistToSession
    expect(await persist(reportId)).toEqual({ status: 'skipped' })
    expect(saveSession).not.toHaveBeenCalled()

    expect(await persist(reportId, 'user')).toEqual({ status: 'acknowledged' })
    expect(updateSessionData).toHaveBeenCalledWith({ _normalizations: [] })
    expect(saveSession).toHaveBeenCalledWith('user')
    expect(useNormalizationStore.getState().recoveryBuffered).toBe(false)
  })

  it('still waits for restoration before an explicit recovery write', async () => {
    useSessionStore.setState({ restorationComplete: false })
    expect(await useNormalizationStore.getState().persistToSession(reportId, 'user')).toEqual({
      status: 'skipped',
    })
    expect(saveSession).not.toHaveBeenCalled()
    expect(useNormalizationStore.getState().recoveryBuffered).toBe(true)
  })
})
