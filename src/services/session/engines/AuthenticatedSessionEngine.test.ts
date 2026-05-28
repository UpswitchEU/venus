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

    await engine.saveSession('autosave')

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

  it('strips backend-computed fields (valuation_result, html_report, etc.) from autosave PATCH', async () => {
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

    await engine.saveSession('autosave')

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

    const first = engine.saveSession('autosave')
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
    await engine.saveSession('autosave')

    expect(engine.getSession()?.htmlReport).toBe(recoveredHtml)
    expect(engine.getSession()?.reportReady).toBe(true)
  })
})
