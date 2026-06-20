import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionServiceMocks = vi.hoisted(() => ({
  clearSessionCache: vi.fn(),
  loadSession: vi.fn(),
  saveSession: vi.fn(),
}))

vi.mock('../../index', () => ({
  sessionService: {
    clearSessionCache: sessionServiceMocks.clearSessionCache,
    loadSession: sessionServiceMocks.loadSession,
    saveSession: sessionServiceMocks.saveSession,
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

import {
  recordSessionPoolPressure503,
  resetSessionPoolPressureCircuitForTests,
} from '../../../hooks/sessionPoolPressureCircuit'
import { AuthenticatedSessionEngine } from './AuthenticatedSessionEngine'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('AuthenticatedSessionEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSessionPoolPressureCircuitForTests()
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

  it('persists top-level session name through centralized save', async () => {
    const createdAt = new Date('2026-04-05T10:00:00.000Z')
    const updatedSession = {
      reportId: 'val_name_123',
      currentView: 'manual' as const,
      dataSource: 'manual' as const,
      createdAt,
      updatedAt: createdAt,
      sessionData: { company_name: 'Acme BV' },
      partialData: {},
      name: 'Acme BV business valuation',
    }

    sessionServiceMocks.saveSession.mockResolvedValue(updatedSession)

    const engine = new AuthenticatedSessionEngine()
    engine.updateSession({
      reportId: 'val_name_123',
      currentView: 'manual',
      dataSource: 'manual',
      createdAt,
      updatedAt: createdAt,
      sessionData: { company_name: 'Acme BV' },
      partialData: {},
      name: 'Acme BV business valuation',
    })

    await engine.saveSession('user')

    expect(sessionServiceMocks.saveSession).toHaveBeenCalledWith(
      'val_name_123',
      expect.objectContaining({
        company_name: 'Acme BV',
        currentView: 'manual',
        name: 'Acme BV business valuation',
      })
    )
    expect(engine.getSession()?.name).toBe('Acme BV business valuation')
  })

  it('strips backend-computed fields (valuation_result, html_report, etc.) from save PATCH', async () => {
    // Regression: METANOUS revisit shipped a 13.9MB PATCH (Titan log
    // content-length: 13920316) that timed out with "Premature close" 500s.
    // The engine kept server-rendered artifacts in sessionData and round-
    // tripped them on every autosave. Strip them at the boundary.
    const createdAt = new Date('2026-05-12T18:13:00.000Z')
    const updatedSession = {
      reportId: 'val_strip_456',
      currentView: 'manual' as const,
      dataSource: 'manual' as const,
      createdAt,
      updatedAt: createdAt,
      sessionData: { company_name: 'METANOUS' },
      partialData: {},
    }
    sessionServiceMocks.saveSession.mockResolvedValue(updatedSession)

    const engine = new AuthenticatedSessionEngine()
    engine.updateSession({
      reportId: 'val_strip_456',
      currentView: 'manual',
      dataSource: 'manual',
      createdAt,
      updatedAt: createdAt,
      sessionData: {
        company_name: 'METANOUS',
        revenue: 1_000_000,
        // Heavy server-rendered fields — must NOT be in the PATCH body.
        valuation_result: { equity_value_mid: 1_334_032, html_report: 'X'.repeat(5_000_000) },
        valuationResult: { copy_of_above: true },
        html_report: '<html>'.padEnd(3_000_000, 'X'),
        htmlReport: 'mirror',
        pdf_html_report: '<html>'.padEnd(2_000_000, 'P'),
        pdfHtmlReport: 'mirror',
        _pdfHtmlReport: 'mirror',
        pdfHtml: 'legacy mirror',
        reportHtml: 'legacy report mirror',
        report_context: { equity_value_mid: 1_334_032 },
      },
      partialData: {},
    })

    await engine.saveSession('user')

    const [, payload] = sessionServiceMocks.saveSession.mock.calls[0]
    // Form data still ships.
    expect(payload).toMatchObject({
      company_name: 'METANOUS',
      revenue: 1_000_000,
      currentView: 'manual',
    })
    // Backend-computed keys are stripped — every one of them.
    expect(payload).not.toHaveProperty('valuation_result')
    expect(payload).not.toHaveProperty('valuationResult')
    expect(payload).not.toHaveProperty('html_report')
    expect(payload).not.toHaveProperty('htmlReport')
    expect(payload).not.toHaveProperty('pdf_html_report')
    expect(payload).not.toHaveProperty('pdfHtmlReport')
    expect(payload).not.toHaveProperty('_pdfHtmlReport')
    expect(payload).not.toHaveProperty('pdfHtml')
    expect(payload).not.toHaveProperty('reportHtml')
    expect(payload).not.toHaveProperty('report_context')
    // Sanity: the stripped payload is at most a few KB — definitely
    // not the 13.9MB the original PATCH shipped.
    expect(JSON.stringify(payload).length).toBeLessThan(10_000)
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

  it('hydrateSession preserves URL reportId when SessionBackgroundRevalidation hydrates with the canonical session_key', () => {
    // Regression: Titan returns sessions keyed on `session_key` (e.g. val_*) but
    // Mercury delegated URLs hand off the report UUID. SessionBackgroundRevalidation
    // promotes the canonical session_key into the hydrate payload to keep server
    // identity authoritative. Without engine-level normalization, the spread inside
    // applyUpdate overwrites session.reportId with the session_key, and
    // ValuationSessionManager's `session.reportId === reportId` gate flips off
    // until the 30s safety-timer surfaces a "session timeout" to the user.
    const createdAt = new Date('2026-05-28T18:00:00.000Z')
    const urlReportUuid = 'f712d21d-e509-43dd-9112-114281ab0a80'
    const canonicalSessionKey = 'val_1779977030082_v5f70e4f9a'

    const engine = new AuthenticatedSessionEngine()
    // Mercury delegated bootstrap path: store seeds the engine with the URL UUID.
    engine.hydrateSession({
      reportId: urlReportUuid,
      currentView: 'manual',
      dataSource: 'manual',
      createdAt,
      updatedAt: createdAt,
      sessionData: { company_name: 'Acme BV' },
    })
    expect(engine.getSession()?.reportId).toBe(urlReportUuid)

    // SessionBackgroundRevalidation later hydrates with the server's canonical
    // session_key. The engine must snap session.reportId back to the URL UUID.
    engine.hydrateSession({
      reportId: canonicalSessionKey,
      htmlReport: '<main>Recovered after ensure-html</main>',
      sessionData: { company_name: 'Acme BV', revenue: 1_000_000 },
    })

    expect(engine.getSession()?.reportId).toBe(urlReportUuid)
    // The hydration's other fields still applied — only reportId is pinned.
    expect(engine.getSession()?.htmlReport).toBe('<main>Recovered after ensure-html</main>')
    expect(engine.getSession()?.sessionData).toMatchObject({ revenue: 1_000_000 })
  })

  it('updateSession preserves URL reportId when an updater ships the canonical session_key', () => {
    const createdAt = new Date('2026-05-28T18:00:00.000Z')
    const urlReportUuid = 'f712d21d-e509-43dd-9112-114281ab0a80'
    const canonicalSessionKey = 'val_1779977030082_v5f70e4f9a'

    const engine = new AuthenticatedSessionEngine()
    // Seed requestedReportId via the same path bootstrap uses in production.
    engine.hydrateSession({
      reportId: urlReportUuid,
      currentView: 'manual',
      dataSource: 'manual',
      createdAt,
      updatedAt: createdAt,
      sessionData: { company_name: 'Acme BV' },
    })

    // A subsequent updateSession that carries the canonical id must not drift.
    engine.updateSession({
      reportId: canonicalSessionKey,
      valuationResult: { equity_value_mid: 1_500_000 },
    })

    expect(engine.getSession()?.reportId).toBe(urlReportUuid)
    expect(engine.getSession()?.valuationResult).toMatchObject({ equity_value_mid: 1_500_000 })
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

  it('preserves recovered HTML when autosave response returns stale server snapshot', async () => {
    const createdAt = new Date('2026-05-26T10:00:00.000Z')
    const recoveredHtml = '<main>Recovered report after save</main>'
    const localSession = {
      reportId: 'val_save_recovered',
      currentView: 'manual' as const,
      dataSource: 'manual' as const,
      createdAt,
      updatedAt: createdAt,
      sessionData: { company_name: 'METANOUS', _htmlReport: recoveredHtml },
      partialData: {},
      htmlReport: recoveredHtml,
      reportReady: true,
      valuationResult: { equity_value_mid: 750_000, html_report: recoveredHtml },
    }
    const staleServerSession = {
      reportId: 'val_save_recovered',
      currentView: 'manual' as const,
      dataSource: 'manual' as const,
      createdAt,
      updatedAt: new Date('2026-05-26T10:00:01.000Z'),
      sessionData: { company_name: 'METANOUS' },
      partialData: {},
      reportReady: false,
      valuationResult: { equity_value_mid: 750_000 },
    }

    sessionServiceMocks.saveSession.mockResolvedValue(staleServerSession)

    const engine = new AuthenticatedSessionEngine()
    engine.updateSession(localSession)
    await engine.saveSession('user')

    expect(engine.getSession()?.htmlReport).toBe(recoveredHtml)
    expect(engine.getSession()?.reportReady).toBe(true)
  })
})
