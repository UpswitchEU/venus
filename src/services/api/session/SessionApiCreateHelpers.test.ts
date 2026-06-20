import { describe, expect, it } from 'vitest'
import {
  buildCreateValuationSessionRequest,
  type CreateValuationSessionInput,
  normalizeCreateValuationSessionResponse,
} from './SessionApiCreateHelpers'

describe('buildCreateValuationSessionRequest', () => {
  it('builds a strict Titan POST payload with reportId as idempotency key', () => {
    const heavyHtml = '<html>' + 'x'.repeat(5000)

    const model = buildCreateValuationSessionRequest({
      reportId: 'report-1',
      currentView: 'conversational',
      current_step: 3,
      name: 'Acme NV business valuation',
      sessionData: {
        company_name: 'Acme NV',
        html_report: heavyHtml,
      },
      partialData: {
        revenue: 1_250_000,
        pdf_html_report: heavyHtml,
      },
      dataSource: 'conversational',
    } satisfies CreateValuationSessionInput)

    expect(model).toEqual({
      currentView: 'conversational',
      sessionKey: 'report-1',
      payload: {
        session_data: {
          company_name: 'Acme NV',
          revenue: 1_250_000,
          currentView: 'conversational',
          dataSource: 'conversational',
          name: 'Acme NV business valuation',
        },
        view_type: 'advanced',
        current_step: 3,
        currentView: 'conversational',
        session_key: 'report-1',
      },
    })
  })

  it('prefers explicit session_key over reportId', () => {
    const model = buildCreateValuationSessionRequest({
      reportId: 'report-1',
      session_key: 'session-key-1',
      sessionData: {},
    } satisfies CreateValuationSessionInput)

    expect(model.sessionKey).toBe('session-key-1')
    expect(model.payload.session_key).toBe('session-key-1')
    expect(model.payload.view_type).toBe('simple')
    expect(model.payload.current_step).toBe(1)
  })
})

describe('normalizeCreateValuationSessionResponse', () => {
  it('maps Titan session_key and session_data into a Venus-compatible response', () => {
    const response = normalizeCreateValuationSessionResponse(
      {
        id: 'db-row-1',
        session_key: 'report-1',
        session_data: {
          company_name: 'Acme NV',
          name: 'Acme NV business valuation',
          currentView: 'ai-guided',
          dataSource: 'ai-guided',
        },
      },
      { currentView: 'manual' }
    )

    expect(response.success).toBe(true)
    expect(response.reportId).toBe('report-1')
    expect(response.session?.reportId).toBe('report-1')
    expect(response.session?.currentView).toBe('conversational')
    expect(response.session?.name).toBe('Acme NV business valuation')
    expect(response.session?.sessionData).toMatchObject({
      company_name: 'Acme NV',
      dataSource: 'conversational',
    })
  })

  it('uses the requested name when Titan omits a response session_data name', () => {
    const response = normalizeCreateValuationSessionResponse(
      {
        session_key: 'report-1',
        session_data: { company_name: 'Acme NV' },
      },
      { currentView: 'manual', fallbackName: 'Fallback valuation name' }
    )

    expect(response.session?.name).toBe('Fallback valuation name')
  })

  it('rejects malformed create responses before the service touches partial fields', () => {
    expect(() =>
      normalizeCreateValuationSessionResponse(
        { session_data: { company_name: 'Acme NV' } },
        { currentView: 'manual' }
      )
    ).toThrow('missing session_key')
  })
})
