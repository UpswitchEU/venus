import { describe, expect, it } from 'vitest'
import {
  mapReportFlowTypeToCurrentView,
  mapReportFlowTypeToDataSource,
  normalizeReportListPayload,
} from './ReportListNormalizer'

describe('ReportListNormalizer', () => {
  it('normalizes backend report rows into valuation sessions', () => {
    const [session] = normalizeReportListPayload({
      data: [
        {
          id: 'report-1',
          flow_type: 'manual',
          current_view: 'ai-guided',
          data_source: 'ai-guided',
          name: 'Advisor valuation',
          company_name: 'Fallback Co',
          created_at: '2026-06-20T10:00:00.000Z',
          updated_at: '2026-06-21T10:00:00.000Z',
          completed_at: '2026-06-21T11:00:00.000Z',
          calculated_at: '2026-06-21T12:00:00.000Z',
          partial_data: { revenue: 1_000_000 },
          session_data: { ebitda: 200_000 },
          valuation_result: { equity_value_mid: 2_000_000 },
          html_report: '<main><h1>Full valuation report</h1><p>Detailed report body.</p></main>',
        },
      ],
    })

    expect(session).toMatchObject({
      reportId: 'report-1',
      currentView: 'conversational',
      dataSource: 'conversational',
      name: 'Advisor valuation',
      partialData: { revenue: 1_000_000 },
      sessionData: { ebitda: 200_000, company_name: 'Fallback Co' },
      valuationResult: { equity_value_mid: 2_000_000 },
      htmlReport: '<main><h1>Full valuation report</h1><p>Detailed report body.</p></main>',
    })
    expect(session.createdAt.toISOString()).toBe('2026-06-20T10:00:00.000Z')
    expect(session.updatedAt.toISOString()).toBe('2026-06-21T10:00:00.000Z')
    expect(session.completedAt?.toISOString()).toBe('2026-06-21T11:00:00.000Z')
    expect(session.calculatedAt?.toISOString()).toBe('2026-06-21T12:00:00.000Z')
  })

  it('preserves session company names and filters non-renderable safety-net html', () => {
    const [session] = normalizeReportListPayload({
      sessions: [
        {
          report_id: 'report-2',
          flow_type: 'manual',
          company_name: 'Top Level Co',
          session_data: { company_name: 'Canonical Co' },
          html_report:
            '<section class="legacy valuation-summary compact"><h1>Waardeschatting — samenvatting</h1></section>',
        },
      ],
    })

    expect(session.reportId).toBe('report-2')
    expect(session.sessionData).toEqual({ company_name: 'Canonical Co' })
    expect(session.htmlReport).toBeUndefined()
  })

  it('returns an empty list for malformed payloads', () => {
    expect(normalizeReportListPayload(null)).toEqual([])
    expect(normalizeReportListPayload({ data: { id: 'not-array' } })).toEqual([])
    expect(normalizeReportListPayload({ sessions: 'not-array' })).toEqual([])
  })

  it('maps backend flow aliases consistently', () => {
    expect(mapReportFlowTypeToCurrentView('conversational')).toBe('conversational')
    expect(mapReportFlowTypeToCurrentView('manual', 'ai-guided')).toBe('conversational')
    expect(mapReportFlowTypeToCurrentView('api', 'manual')).toBe('manual')

    expect(mapReportFlowTypeToDataSource('conversational')).toBe('conversational')
    expect(mapReportFlowTypeToDataSource('manual', 'ai-guided')).toBe('conversational')
    expect(mapReportFlowTypeToDataSource('api', 'manual')).toBe('manual')
  })
})
