import { beforeEach, describe, expect } from 'vitest'
import {
  AuthenticatedSessionEngine,
  getSessionServiceMocks,
  resetAuthenticatedSessionEngineHarness,
} from './AuthenticatedSessionEngine.testHarness'

const sessionServiceMocks = getSessionServiceMocks()

describe('AuthenticatedSessionEngine payload and identity boundaries', () => {
  beforeEach(() => {
    resetAuthenticatedSessionEngineHarness()
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
