import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiLoggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
}))

vi.mock('../../utils/logger', () => ({
  apiLogger: apiLoggerMock,
}))

import {
  buildValuationResponseDiagnosticSnapshot,
  classifyValuationResponseEndpoint,
  extractHttpResponseData,
  logValuationResponseDiagnostics,
} from './HttpClientResponseDiagnostics'

describe('HttpClientResponseDiagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('unwraps nested backend response data without changing direct response semantics', () => {
    const nested = { success: true, data: { html_report: '<main>ok</main>' } }
    expect(extractHttpResponseData(nested)).toEqual({
      nestedData: { html_report: '<main>ok</main>' },
      responseData: { html_report: '<main>ok</main>' },
    })

    const direct = { html_report: '<main>direct</main>' }
    expect(extractHttpResponseData(direct)).toEqual({
      nestedData: undefined,
      responseData: direct,
    })
  })

  it('classifies calculation and session endpoints while excluding result-save PUTs', () => {
    expect(
      classifyValuationResponseEndpoint({
        method: 'POST',
        url: '/api/v2/valuations/calculate-unified',
      })
    ).toBe('calculate')
    expect(
      classifyValuationResponseEndpoint({
        method: 'GET',
        url: '/api/v2/valuation-sessions/val_123',
      })
    ).toBe('session')
    expect(
      classifyValuationResponseEndpoint({
        method: 'PUT',
        url: '/api/v2/valuation-sessions/val_123/result',
      })
    ).toBeNull()
  })

  it('builds stable diagnostic snapshots for nested valuation calculation responses', () => {
    const rawData = {
      success: true,
      data: {
        html_report: '<main>valuation</main>',
        pdf_url: 'https://example.test/report.pdf',
      },
    }
    const { nestedData, responseData } = extractHttpResponseData(rawData)

    expect(
      buildValuationResponseDiagnosticSnapshot({
        config: { method: 'POST', url: '/api/v2/valuations/calculate-unified' },
        nestedData,
        rawData,
        responseData,
      })
    ).toMatchObject({
      endpointType: 'calculate',
      extractionMethod: 'nested',
      hasHtmlReport: true,
      hasNestedData: true,
      hasPdfUrl: true,
      htmlReportLength: '<main>valuation</main>'.length,
      nestedDataKeys: ['html_report', 'pdf_url'],
      rawDataKeys: ['success', 'data'],
    })
  })

  it('does not produce diagnostics for unrelated endpoints', () => {
    expect(
      buildValuationResponseDiagnosticSnapshot({
        config: { method: 'GET', url: '/api/v2/health' },
        nestedData: undefined,
        rawData: { ok: true },
        responseData: { ok: true },
      })
    ).toBeNull()
  })

  it('logs a critical diagnostic when calculation responses are missing renderable HTML', () => {
    const rawData = { success: true, data: { pdf_url: 'https://example.test/report.pdf' } }
    const { nestedData, responseData } = extractHttpResponseData(rawData)

    logValuationResponseDiagnostics({
      config: { method: 'POST', url: '/api/v2/valuations/calculate-unified' },
      nestedData,
      rawData,
      responseData,
    })

    expect(apiLoggerMock.info).toHaveBeenCalledWith(
      'DIAGNOSTIC: Valuation response received',
      expect.objectContaining({
        endpointType: 'calculate',
        hasHtmlReport: false,
        htmlReportLength: 0,
      })
    )
    expect(apiLoggerMock.error).toHaveBeenCalledWith(
      'CRITICAL: html_report missing or empty in valuation response',
      expect.objectContaining({
        note: 'POST /calculate endpoints should always return HTML reports',
      })
    )
  })

  it('does not flag session reads as critical when HTML is not present yet', () => {
    const rawData = { success: true, data: { status: 'pending' } }
    const { nestedData, responseData } = extractHttpResponseData(rawData)

    logValuationResponseDiagnostics({
      config: { method: 'GET', url: '/api/v2/valuation-sessions/val_123' },
      nestedData,
      rawData,
      responseData,
    })

    expect(apiLoggerMock.info).toHaveBeenCalledWith(
      'DIAGNOSTIC: Valuation response received',
      expect.objectContaining({
        endpointType: 'session',
        hasHtmlReport: false,
      })
    )
    expect(apiLoggerMock.error).not.toHaveBeenCalled()
  })
})
