import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../index', () => ({
  sessionService: {
    saveSession: vi.fn(),
  },
}))

vi.mock('../../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/logger')>()
  return {
    ...actual,
    generalLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }
})

import type { ValuationSession } from '../../../types/valuation'
import {
  type AuthenticatedSessionSaveExecutorState,
  executeAuthenticatedSessionSave,
} from './AuthenticatedSessionSaveExecutor'
import {
  autosavePayloadFingerprint,
  buildAuthenticatedSessionSavePayload,
} from './AuthenticatedSessionSavePayload'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function makeSession(overrides: Partial<ValuationSession> = {}): ValuationSession {
  const createdAt = new Date('2026-06-22T10:00:00.000Z')
  return {
    reportId: 'val_executor',
    currentView: 'manual',
    dataSource: 'manual',
    createdAt,
    updatedAt: createdAt,
    sessionData: { company_name: 'Executor BV', revenue: 1_000_000 },
    partialData: {},
    ...overrides,
  }
}

function makeExecutorHarness(initialSession = makeSession()) {
  const replaceCurrentSession = vi.fn((session: ValuationSession) => {
    state.currentSession = session
  })
  const setLastPersistedSaveFingerprint = vi.fn((fingerprint: string) => {
    state.lastPersistedSaveFingerprint = fingerprint
  })
  const saveSession = vi.fn()
  const state: AuthenticatedSessionSaveExecutorState = {
    currentSession: initialSession,
    sessionLifecycleVersion: 1,
    localMutationVersion: 1,
    savePending: false,
    lastPersistedSaveFingerprint: null,
  }

  return {
    state,
    saveSession,
    replaceCurrentSession,
    setLastPersistedSaveFingerprint,
    run: (reason: 'user' | 'autosave' | 'system' = 'user') =>
      executeAuthenticatedSessionSave({
        reason,
        queueReportId: 'val_executor',
        queueLifecycleVersion: 1,
        getState: () => ({ ...state }),
        isActiveSaveQueue: (reportId, lifecycleVersion) =>
          state.currentSession?.reportId === reportId &&
          state.sessionLifecycleVersion === lifecycleVersion,
        replaceCurrentSession,
        normalizeReportId: vi.fn(),
        setLastPersistedSaveFingerprint,
        saveSession,
        sleepMs: vi.fn(),
      }),
  }
}

describe('AuthenticatedSessionSaveExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips duplicate autosave payloads without hitting the backend', async () => {
    const session = makeSession()
    const harness = makeExecutorHarness(session)
    harness.state.lastPersistedSaveFingerprint = autosavePayloadFingerprint(
      buildAuthenticatedSessionSavePayload(session)
    )

    await expect(harness.run('autosave')).resolves.toBe(1)

    expect(harness.saveSession).not.toHaveBeenCalled()
    expect(harness.replaceCurrentSession).not.toHaveBeenCalled()
    expect(harness.setLastPersistedSaveFingerprint).not.toHaveBeenCalled()
  })

  it('ignores stale save responses after the queue loses ownership', async () => {
    const save = deferred<ValuationSession>()
    const harness = makeExecutorHarness()
    harness.saveSession.mockReturnValueOnce(save.promise)

    const result = harness.run('user')
    await Promise.resolve()
    harness.state.currentSession = makeSession({ reportId: 'val_next_report' })
    harness.state.sessionLifecycleVersion = 2
    harness.state.localMutationVersion = 2

    save.resolve(makeSession({ sessionData: { company_name: 'Stale Server BV' } }))

    await expect(result).resolves.toBe(1)
    expect(harness.replaceCurrentSession).not.toHaveBeenCalled()
    expect(harness.state.currentSession?.reportId).toBe('val_next_report')
  })

  it('preserves local edits made while the save request is in flight', async () => {
    const save = deferred<ValuationSession>()
    const harness = makeExecutorHarness()
    harness.saveSession.mockReturnValueOnce(save.promise)

    const result = harness.run('user')
    await Promise.resolve()

    harness.state.currentSession = makeSession({
      sessionData: {
        company_name: 'Executor BV',
        revenue: 1_250_000,
        ebitda: 250_000,
      },
    })
    harness.state.localMutationVersion = 2
    harness.state.savePending = true

    save.resolve(
      makeSession({
        updatedAt: new Date('2026-06-22T10:00:01.000Z'),
        sessionData: { company_name: 'Executor BV', revenue: 1_000_000 },
      })
    )

    await expect(result).resolves.toBe(1)
    expect(harness.state.currentSession?.sessionData).toMatchObject({
      company_name: 'Executor BV',
      revenue: 1_250_000,
      ebitda: 250_000,
    })
    expect(harness.setLastPersistedSaveFingerprint).toHaveBeenCalledTimes(1)
  })
})
