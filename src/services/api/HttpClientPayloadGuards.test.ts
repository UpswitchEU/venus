import type { AxiosRequestConfig } from 'axios'
import { describe, expect, it } from 'vitest'
import {
  getConfigBodyFieldByteLengths,
  getConfigReportBlobLengths,
  omitOversizedValuationResultReportBlobs,
  VALUATION_RESULT_HTML_OMIT_BYTES,
  withoutConfigReportBlobs,
} from './HttpClientPayloadGuards'

function valuationResultConfig(data: Record<string, unknown>): AxiosRequestConfig {
  return {
    method: 'PUT',
    url: '/api/v2/valuations/sessions/session_123/result',
    data,
  }
}

describe('HttpClientPayloadGuards', () => {
  it('does not alter valuation result saves that remain under the payload limit', () => {
    const config = valuationResultConfig({
      sessionData: { company_name: 'Small Corp' },
      valuationResult: { equity_value_mid: 1000000 },
      htmlReport: '<html>small</html>',
      reportHtml: '<html>alias</html>',
    })

    const prepared = omitOversizedValuationResultReportBlobs(config)

    expect(prepared.omitted).toBe(false)
    expect(prepared.config).toBe(config)
    expect(prepared.estimatedBodyBytes).toBeGreaterThan(0)
    expect(getConfigReportBlobLengths(config)).toEqual({
      htmlReport: '<html>small</html>'.length,
      reportHtml: '<html>alias</html>'.length,
    })
  })

  it('omits every top-level report blob alias once the valuation result body is too large', () => {
    const largeHtml = `<html>${'x'.repeat(VALUATION_RESULT_HTML_OMIT_BYTES + 1)}</html>`
    const config = valuationResultConfig({
      sessionData: { company_name: 'Large Corp' },
      valuationResult: { equity_value_mid: 2500000 },
      htmlReport: largeHtml,
      html_report: '<html>snake</html>',
      _htmlReport: '<html>private</html>',
      pdfHtmlReport: '<html>pdf</html>',
      pdf_html_report: '<html>pdf snake</html>',
      _pdfHtmlReport: '<html>private pdf</html>',
      pdfHtml: '<html>pdf alias</html>',
      reportHtml: '<html>report alias</html>',
      unrelated: '<html>keep me</html>',
    })

    const prepared = omitOversizedValuationResultReportBlobs(config)
    const data = prepared.config.data as Record<string, unknown>

    expect(prepared.omitted).toBe(true)
    expect(prepared.config).not.toBe(config)
    expect(data.htmlReport).toBeUndefined()
    expect(data.html_report).toBeUndefined()
    expect(data._htmlReport).toBeUndefined()
    expect(data.pdfHtmlReport).toBeUndefined()
    expect(data.pdf_html_report).toBeUndefined()
    expect(data._pdfHtmlReport).toBeUndefined()
    expect(data.pdfHtml).toBeUndefined()
    expect(data.reportHtml).toBeUndefined()
    expect(data.unrelated).toBe('<html>keep me</html>')
    expect(data.sessionData).toMatchObject({ company_name: 'Large Corp' })
  })

  it('prepares a 413 fallback only for valuation result save requests with report blobs', () => {
    const data = { htmlReport: '<html>rendered</html>' }

    expect(withoutConfigReportBlobs(valuationResultConfig(data))).toMatchObject({
      data: { htmlReport: undefined },
    })
    expect(
      withoutConfigReportBlobs({
        method: 'POST',
        url: '/api/v2/valuations/sessions/session_123/result',
        data,
      })
    ).toBeNull()
    expect(
      withoutConfigReportBlobs({
        method: 'PUT',
        url: '/api/v2/valuations/sessions/session_123/result',
        data: { sessionData: { company_name: 'No Html Corp' } },
      })
    ).toBeNull()
  })

  it('reports top-level field byte lengths for oversized payload diagnostics', () => {
    const lengths = getConfigBodyFieldByteLengths(
      valuationResultConfig({
        sessionData: { company_name: 'Byte Corp' },
        htmlReport: '<html>x</html>',
        omitted: undefined,
      })
    )

    expect(lengths.sessionData).toBeGreaterThan(0)
    expect(lengths.htmlReport).toBeGreaterThan(0)
    expect(lengths.omitted).toBeUndefined()
  })
})
