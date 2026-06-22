import { beforeEach, describe, expect, vi } from 'vitest'
import {
  AuthenticatedSessionEngine,
  deferred,
  getSessionServiceMocks,
  resetAuthenticatedSessionEngineHarness,
} from './AuthenticatedSessionEngine.testHarness'

const sessionServiceMocks = getSessionServiceMocks()

describe('AuthenticatedSessionEngine save races', () => {
  beforeEach(() => {
    resetAuthenticatedSessionEngineHarness()
  })

  it('does not resurrect a cleared session when an in-flight save resolves', async () => {
    const createdAt = new Date('2026-06-04T09:10:00.000Z')
    const save = deferred<{
      reportId: string
      currentView: 'manual'
      dataSource: 'manual'
      createdAt: Date
      updatedAt: Date
      sessionData: Record<string, unknown>
      partialData: Record<string, unknown>
    }>()

    sessionServiceMocks.saveSession.mockReturnValueOnce(save.promise)

    const engine = new AuthenticatedSessionEngine()
    engine.updateSession({
      reportId: 'val_clear_during_save',
      currentView: 'manual',
      dataSource: 'manual',
      createdAt,
      updatedAt: createdAt,
      sessionData: { company_name: 'Clear Save BV' },
      partialData: {},
    })

    const savePromise = engine.saveSession('user')
    await Promise.resolve()
    expect(sessionServiceMocks.saveSession).toHaveBeenCalledTimes(1)

    engine.clearSession()
    save.resolve({
      reportId: 'val_clear_during_save',
      currentView: 'manual',
      dataSource: 'manual',
      createdAt,
      updatedAt: new Date('2026-06-04T09:10:01.000Z'),
      sessionData: { company_name: 'Server Snapshot BV' },
      partialData: {},
    })

    await savePromise
    expect(sessionServiceMocks.clearSessionCache).toHaveBeenCalledWith('val_clear_during_save')
    expect(engine.getSession()).toBeNull()
  })

  it('does not surface stale save failures after the session is cleared', async () => {
    const createdAt = new Date('2026-06-04T09:20:00.000Z')
    const save = deferred<{
      reportId: string
      currentView: 'manual'
      dataSource: 'manual'
      createdAt: Date
      updatedAt: Date
      sessionData: Record<string, unknown>
      partialData: Record<string, unknown>
    }>()

    sessionServiceMocks.saveSession.mockReturnValueOnce(save.promise)

    const engine = new AuthenticatedSessionEngine()
    engine.updateSession({
      reportId: 'val_clear_during_save_failure',
      currentView: 'manual',
      dataSource: 'manual',
      createdAt,
      updatedAt: createdAt,
      sessionData: { company_name: 'Clear Failure BV' },
      partialData: {},
    })

    const savePromise = engine.saveSession('user')
    await Promise.resolve()
    engine.clearSession()
    save.reject(new Error('network failed after teardown'))

    await expect(savePromise).resolves.toBeUndefined()
    expect(engine.getSession()).toBeNull()
  })

  it('skips duplicate autosave payloads after a successful save', async () => {
    vi.useFakeTimers()

    try {
      const createdAt = new Date('2026-06-17T13:43:00.000Z')
      const updatedSession = {
        reportId: 'val_duplicate_autosave',
        currentView: 'manual' as const,
        dataSource: 'manual' as const,
        createdAt,
        updatedAt: new Date('2026-06-17T13:43:01.000Z'),
        sessionData: { company_name: 'Stemafisk BV', revenue: 1_000_000 },
        partialData: {},
      }
      sessionServiceMocks.saveSession.mockResolvedValue(updatedSession)

      const engine = new AuthenticatedSessionEngine()
      engine.updateSession({
        reportId: 'val_duplicate_autosave',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt,
        updatedAt: createdAt,
        sessionData: { company_name: 'Stemafisk BV', revenue: 1_000_000 },
        partialData: {},
      })

      await engine.saveSession('user')
      expect(sessionServiceMocks.saveSession).toHaveBeenCalledTimes(1)

      const autosave = engine.saveSession('autosave')
      await vi.advanceTimersByTimeAsync(750)
      await autosave

      expect(sessionServiceMocks.saveSession).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('serializes overlapping saves and preserves local edits made while the first save is in flight', async () => {
    vi.useFakeTimers()

    try {
      const createdAt = new Date('2026-05-26T10:00:00.000Z')
      const firstSave = deferred<{
        reportId: string
        currentView: 'manual'
        dataSource: 'manual'
        createdAt: Date
        updatedAt: Date
        sessionData: Record<string, unknown>
        partialData: Record<string, unknown>
      }>()

      sessionServiceMocks.saveSession
        .mockImplementationOnce(() => firstSave.promise)
        .mockImplementationOnce(async (reportId, payload) => ({
          reportId,
          currentView: 'manual',
          dataSource: 'manual',
          createdAt,
          updatedAt: new Date('2026-05-26T10:00:02.000Z'),
          sessionData: payload,
          partialData: {},
        }))

      const engine = new AuthenticatedSessionEngine()
      engine.updateSession({
        reportId: 'val_race_789',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt,
        updatedAt: createdAt,
        sessionData: { company_name: 'METANOUS', revenue: 1_000_000 },
        partialData: {},
      })

      const first = engine.saveSession('user')
      await Promise.resolve()
      expect(sessionServiceMocks.saveSession).toHaveBeenCalledTimes(1)

      engine.updateSession({
        sessionData: { revenue: 1_250_000, ebitda: 250_000 },
      })
      const second = engine.saveSession('autosave')
      await Promise.resolve()
      expect(sessionServiceMocks.saveSession).toHaveBeenCalledTimes(1)

      firstSave.resolve({
        reportId: 'val_race_789',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt,
        updatedAt: new Date('2026-05-26T10:00:01.000Z'),
        sessionData: { company_name: 'METANOUS', revenue: 1_000_000 },
        partialData: {},
      })

      await vi.advanceTimersByTimeAsync(750)
      await Promise.all([first, second])

      expect(sessionServiceMocks.saveSession).toHaveBeenCalledTimes(2)
      expect(sessionServiceMocks.saveSession.mock.calls[1]?.[1]).toMatchObject({
        company_name: 'METANOUS',
        revenue: 1_250_000,
        ebitda: 250_000,
        currentView: 'manual',
      })
      expect(engine.getSession()?.sessionData).toMatchObject({
        company_name: 'METANOUS',
        revenue: 1_250_000,
        ebitda: 250_000,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('coalesces rapid autosave callers into one settled PATCH with the latest payload', async () => {
    vi.useFakeTimers()

    try {
      const createdAt = new Date('2026-06-03T12:11:00.000Z')
      sessionServiceMocks.saveSession.mockImplementation(async (reportId, payload) => ({
        reportId,
        currentView: 'manual',
        dataSource: 'manual',
        createdAt,
        updatedAt: new Date('2026-06-03T12:11:01.000Z'),
        sessionData: payload,
        partialData: {},
      }))

      const engine = new AuthenticatedSessionEngine()
      engine.updateSession({
        reportId: 'val_autosave_burst',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt,
        updatedAt: createdAt,
        sessionData: { company_name: 'Initial Co', revenue: 1_000_000 },
        partialData: {},
      })

      const first = engine.saveSession('autosave')
      await Promise.resolve()
      expect(sessionServiceMocks.saveSession).not.toHaveBeenCalled()

      engine.updateSession({
        sessionData: { revenue: 1_250_000, ebitda: 250_000 },
      })
      const second = engine.saveSession('autosave')
      await Promise.resolve()

      await vi.advanceTimersByTimeAsync(749)
      expect(sessionServiceMocks.saveSession).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      await Promise.all([first, second])

      expect(sessionServiceMocks.saveSession).toHaveBeenCalledTimes(1)
      expect(sessionServiceMocks.saveSession.mock.calls[0]?.[1]).toMatchObject({
        company_name: 'Initial Co',
        revenue: 1_250_000,
        ebitda: 250_000,
        currentView: 'manual',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('automatically sends a follow-up save when local edits happen during an in-flight request', async () => {
    vi.useFakeTimers()

    try {
      const createdAt = new Date('2026-06-03T13:10:00.000Z')
      const firstSave = deferred<{
        reportId: string
        currentView: 'manual'
        dataSource: 'manual'
        createdAt: Date
        updatedAt: Date
        sessionData: Record<string, unknown>
        partialData: Record<string, unknown>
      }>()

      sessionServiceMocks.saveSession
        .mockImplementationOnce(() => firstSave.promise)
        .mockImplementationOnce(async (reportId, payload) => ({
          reportId,
          currentView: 'manual',
          dataSource: 'manual',
          createdAt,
          updatedAt: new Date('2026-06-03T13:10:02.000Z'),
          sessionData: payload,
          partialData: {},
        }))

      const engine = new AuthenticatedSessionEngine()
      engine.updateSession({
        reportId: 'val_inflight_local_edit',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt,
        updatedAt: createdAt,
        sessionData: { company_name: 'Initial Co', revenue: 1_000_000 },
        partialData: {},
      })

      const savePromise = engine.saveSession('user')
      await Promise.resolve()
      expect(sessionServiceMocks.saveSession).toHaveBeenCalledTimes(1)

      engine.updateSession({
        sessionData: { revenue: 1_500_000, ebitda: 300_000 },
      })

      firstSave.resolve({
        reportId: 'val_inflight_local_edit',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt,
        updatedAt: new Date('2026-06-03T13:10:01.000Z'),
        sessionData: { company_name: 'Initial Co', revenue: 1_000_000 },
        partialData: {},
      })

      await vi.advanceTimersByTimeAsync(750)
      await savePromise

      expect(sessionServiceMocks.saveSession).toHaveBeenCalledTimes(2)
      expect(sessionServiceMocks.saveSession.mock.calls[1]?.[1]).toMatchObject({
        company_name: 'Initial Co',
        revenue: 1_500_000,
        ebitda: 300_000,
        currentView: 'manual',
      })
      expect(engine.getSession()?.sessionData).toMatchObject({
        company_name: 'Initial Co',
        revenue: 1_500_000,
        ebitda: 300_000,
      })
    } finally {
      vi.useRealTimers()
    }
  })
})
