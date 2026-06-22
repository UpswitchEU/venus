import { beforeEach, describe, expect } from 'vitest'
import {
  AuthenticatedSessionEngine,
  deferred,
  getSessionServiceMocks,
  resetAuthenticatedSessionEngineHarness,
} from './AuthenticatedSessionEngine.testHarness'

const sessionServiceMocks = getSessionServiceMocks()

describe('AuthenticatedSessionEngine load coordination', () => {
  beforeEach(() => {
    resetAuthenticatedSessionEngineHarness()
  })

  it('deduplicates same-report loads through the full engine merge path', async () => {
    const createdAt = new Date('2026-06-03T13:00:00.000Z')
    const load = deferred<{
      reportId: string
      currentView: 'manual'
      dataSource: 'manual'
      createdAt: Date
      updatedAt: Date
      sessionData: Record<string, unknown>
      partialData: Record<string, unknown>
    }>()

    sessionServiceMocks.loadSession.mockReturnValueOnce(load.promise)

    const engine = new AuthenticatedSessionEngine()
    const first = engine.loadSession('val_load_same')
    const second = engine.loadSession('val_load_same')
    engine.updateSession({ sessionData: { queued: true } })

    load.resolve({
      reportId: 'val_load_same',
      currentView: 'manual',
      dataSource: 'manual',
      createdAt,
      updatedAt: createdAt,
      sessionData: { company_name: 'Load Co' },
      partialData: {},
    })

    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(sessionServiceMocks.loadSession).toHaveBeenCalledTimes(1)
    expect(firstResult?.sessionData).toMatchObject({ company_name: 'Load Co', queued: true })
    expect(secondResult?.sessionData).toMatchObject({ company_name: 'Load Co', queued: true })
    expect(engine.getSession()?.sessionData).toMatchObject({
      company_name: 'Load Co',
      queued: true,
    })
  })

  it('ignores stale load responses after a newer report load starts', async () => {
    const createdAt = new Date('2026-06-03T13:05:00.000Z')
    const oldLoad = deferred<{
      reportId: string
      currentView: 'manual'
      dataSource: 'manual'
      createdAt: Date
      updatedAt: Date
      sessionData: Record<string, unknown>
      partialData: Record<string, unknown>
    }>()
    const nextLoad = deferred<{
      reportId: string
      currentView: 'manual'
      dataSource: 'manual'
      createdAt: Date
      updatedAt: Date
      sessionData: Record<string, unknown>
      partialData: Record<string, unknown>
    }>()

    sessionServiceMocks.loadSession
      .mockReturnValueOnce(oldLoad.promise)
      .mockReturnValueOnce(nextLoad.promise)

    const engine = new AuthenticatedSessionEngine()
    const oldPromise = engine.loadSession('val_old_report')
    engine.updateSession({ sessionData: { oldQueuedEdit: true } })
    const nextPromise = engine.loadSession('val_next_report')
    engine.updateSession({ sessionData: { nextQueuedEdit: true } })

    nextLoad.resolve({
      reportId: 'val_next_report',
      currentView: 'manual',
      dataSource: 'manual',
      createdAt,
      updatedAt: createdAt,
      sessionData: { company_name: 'Next Co' },
      partialData: {},
    })
    await nextPromise

    oldLoad.resolve({
      reportId: 'val_old_report',
      currentView: 'manual',
      dataSource: 'manual',
      createdAt,
      updatedAt: createdAt,
      sessionData: { company_name: 'Old Co' },
      partialData: {},
    })
    await expect(oldPromise).resolves.toBeNull()

    expect(engine.getSession()?.reportId).toBe('val_next_report')
    expect(engine.getSession()?.sessionData).toMatchObject({
      company_name: 'Next Co',
      nextQueuedEdit: true,
    })
    expect(engine.getSession()?.sessionData).not.toHaveProperty('oldQueuedEdit')
  })

  it('queues updates for the loading report when a previous report is still current', async () => {
    const createdAt = new Date('2026-06-04T08:50:00.000Z')
    const nextLoad = deferred<{
      reportId: string
      currentView: 'manual'
      dataSource: 'manual'
      createdAt: Date
      updatedAt: Date
      sessionData: Record<string, unknown>
      partialData: Record<string, unknown>
    }>()

    sessionServiceMocks.loadSession.mockReturnValueOnce(nextLoad.promise)

    const engine = new AuthenticatedSessionEngine()
    engine.hydrateSession({
      reportId: 'val_previous_report',
      currentView: 'manual',
      dataSource: 'manual',
      createdAt,
      updatedAt: createdAt,
      sessionData: { company_name: 'Previous Co' },
      partialData: {},
    })

    const nextPromise = engine.loadSession('val_next_report')
    engine.updateSession({ sessionData: { queuedForNextReport: true } })

    nextLoad.resolve({
      reportId: 'val_next_report',
      currentView: 'manual',
      dataSource: 'manual',
      createdAt,
      updatedAt: createdAt,
      sessionData: { company_name: 'Next Co' },
      partialData: {},
    })

    await nextPromise

    expect(engine.getSession()?.reportId).toBe('val_next_report')
    expect(engine.getSession()?.sessionData).toMatchObject({
      company_name: 'Next Co',
      queuedForNextReport: true,
    })
    expect(engine.getSession()?.sessionData).not.toMatchObject({
      company_name: 'Previous Co',
    })
  })

  it('does not hydrate a stale load after the session is cleared', async () => {
    const createdAt = new Date('2026-06-04T09:00:00.000Z')
    const load = deferred<{
      reportId: string
      currentView: 'manual'
      dataSource: 'manual'
      createdAt: Date
      updatedAt: Date
      sessionData: Record<string, unknown>
      partialData: Record<string, unknown>
    }>()

    sessionServiceMocks.loadSession.mockReturnValueOnce(load.promise)

    const engine = new AuthenticatedSessionEngine()
    const loadPromise = engine.loadSession('val_clear_during_load')
    engine.updateSession({ sessionData: { queuedBeforeClear: true } })
    engine.clearSession()

    load.resolve({
      reportId: 'val_clear_during_load',
      currentView: 'manual',
      dataSource: 'manual',
      createdAt,
      updatedAt: createdAt,
      sessionData: { company_name: 'Stale Load BV' },
      partialData: {},
    })

    await expect(loadPromise).resolves.toBeNull()
    expect(engine.getSession()).toBeNull()
  })
})
