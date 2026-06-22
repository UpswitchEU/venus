import { beforeEach, describe, expect, vi } from 'vitest'
import {
  AuthenticatedSessionEngine,
  getSessionServiceMocks,
  recordSessionPoolPressure503,
  resetAuthenticatedSessionEngineHarness,
} from './AuthenticatedSessionEngine.testHarness'

const sessionServiceMocks = getSessionServiceMocks()

describe('AuthenticatedSessionEngine retry and pool pressure policy', () => {
  beforeEach(() => {
    resetAuthenticatedSessionEngineHarness()
  })

  it('retries transient auth-service save outages before surfacing failure', async () => {
    vi.useFakeTimers()

    try {
      const createdAt = new Date('2026-06-02T09:00:00.000Z')
      const updatedSession = {
        reportId: 'val_auth_blip',
        currentView: 'manual' as const,
        dataSource: 'manual' as const,
        createdAt,
        updatedAt: new Date('2026-06-02T09:00:01.000Z'),
        sessionData: { company_name: 'Restaurant Decan' },
        partialData: {},
      }

      sessionServiceMocks.saveSession
        .mockRejectedValueOnce(
          Object.assign(
            new Error('Failed to save session: Authentication service temporarily unavailable'),
            {
              context: {
                originalError: {
                  code: 'CALCULATION_ERROR',
                  context: { statusCode: 500 },
                },
              },
            }
          )
        )
        .mockResolvedValueOnce(updatedSession)

      const engine = new AuthenticatedSessionEngine()
      engine.updateSession({
        reportId: 'val_auth_blip',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt,
        updatedAt: createdAt,
        sessionData: { company_name: 'Restaurant Decan' },
        partialData: {},
      })

      const savePromise = engine.saveSession('autosave')
      await vi.advanceTimersByTimeAsync(750)
      expect(sessionServiceMocks.saveSession).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1000)
      await savePromise

      expect(sessionServiceMocks.saveSession).toHaveBeenCalledTimes(2)
      expect(engine.getSession()?.updatedAt).toEqual(updatedSession.updatedAt)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not retry pool-pressure 503 save failures', async () => {
    vi.useFakeTimers()

    try {
      const createdAt = new Date('2026-06-02T09:05:00.000Z')
      sessionServiceMocks.saveSession.mockRejectedValue(
        new Error('Failed to save session: Request failed with status code 503')
      )

      const engine = new AuthenticatedSessionEngine()
      engine.updateSession({
        reportId: 'val_auth_status_text_blip',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt,
        updatedAt: createdAt,
        sessionData: { company_name: 'Restaurant Decan' },
        partialData: {},
      })

      const savePromise = expect(engine.saveSession('autosave')).rejects.toThrow(
        'Request failed with status code 503'
      )
      await vi.advanceTimersByTimeAsync(750)
      await savePromise

      expect(sessionServiceMocks.saveSession).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries client-aborted 499 save failures before surfacing failure', async () => {
    vi.useFakeTimers()

    try {
      const createdAt = new Date('2026-06-03T12:11:00.000Z')
      const updatedSession = {
        reportId: 'val_client_abort_499',
        currentView: 'manual' as const,
        dataSource: 'manual' as const,
        createdAt,
        updatedAt: new Date('2026-06-03T12:11:01.000Z'),
        sessionData: { company_name: 'Restaurant Decan' },
        partialData: {},
      }

      sessionServiceMocks.saveSession
        .mockRejectedValueOnce(
          new Error('Failed to save session: Request failed with status code 499')
        )
        .mockResolvedValueOnce(updatedSession)

      const engine = new AuthenticatedSessionEngine()
      engine.updateSession({
        reportId: 'val_client_abort_499',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt,
        updatedAt: createdAt,
        sessionData: { company_name: 'Restaurant Decan' },
        partialData: {},
      })

      const savePromise = engine.saveSession('autosave')
      await vi.advanceTimersByTimeAsync(750)
      expect(sessionServiceMocks.saveSession).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1000)
      await savePromise

      expect(sessionServiceMocks.saveSession).toHaveBeenCalledTimes(2)
      expect(engine.getSession()?.updatedAt).toEqual(updatedSession.updatedAt)
    } finally {
      vi.useRealTimers()
    }
  })

  it('defers autosave until pool-pressure circuit closes', async () => {
    vi.useFakeTimers()

    try {
      const createdAt = new Date('2026-06-02T09:07:00.000Z')
      const updatedSession = {
        reportId: 'val_pool_circuit',
        currentView: 'manual' as const,
        dataSource: 'manual' as const,
        createdAt,
        updatedAt: new Date('2026-06-02T09:07:01.000Z'),
        sessionData: { company_name: 'Restaurant Decan' },
        partialData: {},
      }
      sessionServiceMocks.saveSession.mockResolvedValue(updatedSession)

      const circuitOpenedAt = Date.now()
      recordSessionPoolPressure503(circuitOpenedAt)

      const engine = new AuthenticatedSessionEngine()
      engine.updateSession({
        reportId: 'val_pool_circuit',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt,
        updatedAt: createdAt,
        sessionData: { company_name: 'Restaurant Decan' },
        partialData: {},
      })

      const savePromise = engine.saveSession('autosave')
      await vi.advanceTimersByTimeAsync(750)
      expect(sessionServiceMocks.saveSession).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(8000)
      await savePromise

      expect(sessionServiceMocks.saveSession).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not retry a save failure only because an incidental number looks like 503', async () => {
    vi.useFakeTimers()

    try {
      const createdAt = new Date('2026-06-02T09:06:00.000Z')
      sessionServiceMocks.saveSession.mockRejectedValue(
        new Error('Failed to save session: validation failed for registry row 503')
      )

      const engine = new AuthenticatedSessionEngine()
      engine.updateSession({
        reportId: 'val_incidental_503',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt,
        updatedAt: createdAt,
        sessionData: { company_name: 'Restaurant Decan' },
        partialData: {},
      })

      const savePromise = expect(engine.saveSession('autosave')).rejects.toThrow(
        'validation failed for registry row 503'
      )
      await vi.advanceTimersByTimeAsync(750)
      await savePromise
      expect(sessionServiceMocks.saveSession).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
