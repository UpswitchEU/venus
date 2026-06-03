import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionServiceMocks = vi.hoisted(() => ({
  saveSession: vi.fn(),
}))

vi.mock('../../index', () => ({
  sessionService: {
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

  it('retries transient save outages when the HTTP 503 only appears in the message', async () => {
    vi.useFakeTimers()

    try {
      const createdAt = new Date('2026-06-02T09:05:00.000Z')
      const updatedSession = {
        reportId: 'val_auth_status_text_blip',
        currentView: 'manual' as const,
        dataSource: 'manual' as const,
        createdAt,
        updatedAt: new Date('2026-06-02T09:05:01.000Z'),
        sessionData: { company_name: 'Restaurant Decan' },
        partialData: {},
      }

      sessionServiceMocks.saveSession
        .mockRejectedValueOnce(
          new Error('Failed to save session: Request failed with status code 503')
        )
        .mockResolvedValueOnce(updatedSession)

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
