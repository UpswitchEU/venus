import { beforeEach, describe, expect, it } from 'vitest'
import {
  omitOversizedValuationResultReportBlobs,
  VALUATION_RESULT_HTML_OMIT_BYTES,
} from '../../HttpClientPayloadGuards'
import type { SessionAPI, ValuationResponse } from './SessionAPI.testHarness'
import { executeRequestSpy, resetSessionApiHarness } from './SessionAPI.testHarness'

let api: SessionAPI

beforeEach(() => {
  api = resetSessionApiHarness()
})

describe('SessionAPI', () => {
  describe('saveValuationResult', () => {
    it('returns normalized authoritative session data from PUT /result', async () => {
      executeRequestSpy.mockResolvedValue({
        success: true,
        message: 'saved',
        reportId: 'report-123',
        reportReady: true,
        session: {
          reportId: 'val_ready',
          session_key: 'val_ready',
          status: 'completed',
          session_data: {
            company_name: 'Ready Corp',
            valuation_result: {
              equity_value_mid: 900000,
            },
            html_report: '<html>ready</html>',
          },
        },
      })

      const result = await api.saveValuationResult('val_ready', {
        valuationResult: {
          equity_value_mid: 900000,
        } satisfies Partial<ValuationResponse>,
        htmlReport: '<html>ready</html>',
      })

      expect(result.success).toBe(true)
      expect(result.reportReady).toBe(true)
      expect(result.session?.reportReady).toBe(true)
      expect(result.session?.valuationResult).toMatchObject({ equity_value_mid: 900000 })
      expect(result.session?.htmlReport).toBe('<html>ready</html>')
      expect(result.session?.sessionData).toMatchObject({
        company_name: 'Ready Corp',
      })
    })

    it('sends PUT /result with renderable HTML only once via htmlReport', async () => {
      executeRequestSpy.mockResolvedValue({
        success: true,
        message: 'saved',
        reportId: 'report-123',
        reportReady: true,
      })

      const hugeHtml = '<html>' + 'x'.repeat(5000) + '</html>'

      await api.saveValuationResult('val_slim', {
        sessionData: {
          company_name: 'Slim Corp',
          htmlReport: hugeHtml,
          valuation_result: {
            equity_value_mid: 900000,
            html_report: hugeHtml,
            details: {
              html_report: hugeHtml,
              method: 'dcf',
            },
          },
        },
        valuationResult: {
          equity_value_mid: 900000,
          html_report: hugeHtml,
          htmlReport: hugeHtml,
          pdf_html_report: hugeHtml,
          details: {
            html_report: hugeHtml,
            pdf_html_report: hugeHtml,
            method: 'dcf',
          },
        } satisfies Partial<ValuationResponse>,
        htmlReport: hugeHtml,
      })

      const requestBody = executeRequestSpy.mock.calls[0][0] as {
        data: {
          sessionData: Record<string, unknown>
          valuationResult: Record<string, unknown>
          htmlReport: string
        }
      }
      const resultDetails = requestBody.data.valuationResult.details as Record<string, unknown>

      expect(requestBody.data.htmlReport).toBe(hugeHtml)
      expect(requestBody.data.sessionData.htmlReport).toBeUndefined()
      expect(requestBody.data.sessionData.valuation_result).toBeUndefined()
      expect(requestBody.data.valuationResult.html_report).toBeUndefined()
      expect(requestBody.data.valuationResult.htmlReport).toBeUndefined()
      expect(requestBody.data.valuationResult.pdf_html_report).toBeUndefined()
      expect(resultDetails.html_report).toBeUndefined()
      expect(resultDetails.pdf_html_report).toBeUndefined()
      expect(resultDetails.method).toBe('dcf')
    })

    it('keeps a restored large calculation once, with its full trace and canonical HTML', async () => {
      executeRequestSpy.mockResolvedValue({
        success: true,
        reportId: 'report-123',
        reportReady: true,
        message: 'saved',
      })
      const trace = { evidence: 'x'.repeat(10_000_000), equity_value_mid: 907614.48 }
      const current = { equity_value_mid: 907614.48, detailed_results: trace }
      const htmlReport = `<html>Current two-year report ${'€'.repeat(70_000)}</html>`
      const sessionData = {
        company_name: 'Synthetic Corp',
        revenue: 1600000.42,
        historical_years_data: [{ year: 2024, revenue: 900000, ebitda: 90000 }],
        _client_context: { relationship_id: 'client-123' },
        valuationResult: current,
        valuation_result: current,
        session_data: { valuation_result: current, locale: 'en' },
      }
      await api.saveValuationResult('val_restored', {
        sessionData,
        valuationResult: current,
        htmlReport,
      })
      const config = executeRequestSpy.mock.calls[0][0]
      const prepared = omitOversizedValuationResultReportBlobs(config)
      const body = prepared.config.data
      const wireBytes = new TextEncoder().encode(JSON.stringify(body)).byteLength
      expect(prepared.omitted).toBe(false)
      expect(prepared.estimatedBodyBytes).toBe(wireBytes)
      expect(wireBytes).toBeLessThan(VALUATION_RESULT_HTML_OMIT_BYTES)
      expect(body.valuationResult).toEqual(current)
      expect(body.htmlReport).toBe(htmlReport)
      expect(body.sessionData).toEqual({
        company_name: sessionData.company_name,
        revenue: sessionData.revenue,
        historical_years_data: sessionData.historical_years_data,
        _client_context: sessionData._client_context,
        session_data: { locale: 'en' },
      })
      expect(sessionData.valuation_result).toBe(current)
    })

    it('retains an embedded result when no separate authoritative result is supplied', async () => {
      executeRequestSpy.mockResolvedValue({
        success: true,
        reportId: 'report-123',
        reportReady: true,
        message: 'saved',
      })
      await api.saveValuationResult('val_session_only', {
        sessionData: { valuation_result: { equity_value_mid: 123 } },
      })
      expect(executeRequestSpy.mock.calls[0][0].data.sessionData.valuation_result).toEqual({
        equity_value_mid: 123,
      })
    })

    it('does not resend the recursive version receipt returned by a fresh calculation', async () => {
      executeRequestSpy.mockResolvedValue({
        success: true,
        reportId: 'report-123',
        reportReady: true,
        message: 'saved',
      })
      const financialEvidence = { executed_steps: 'x'.repeat(6_000_000) }
      const economics = {
        equity_value_mid: 907614.48,
        details: { detailed_results: financialEvidence },
        report_context: { normalized_ebitda: 196666.67, version: 'template-v1' },
      }
      // Titan returns the saved row after /calculate; both row fields contain
      // outputs + valuationResult. Its persistence projection already omits it.
      const versionData = { outputs: economics, valuationResult: economics }
      const freshResult = {
        ...economics,
        version: {
          id: 'durable-version-3',
          version_data: versionData,
          trigger_metadata: { versionData },
        },
      }
      expect(new TextEncoder().encode(JSON.stringify(freshResult)).byteLength).toBeGreaterThan(
        30_000_000
      )
      const htmlReport = '<html>Current report ' + '€'.repeat(70_000) + '</html>'
      await api.saveValuationResult('val_fresh', {
        sessionData: { revenue: 1600000.42 },
        valuationResult: freshResult,
        htmlReport,
      })
      const prepared = omitOversizedValuationResultReportBlobs(executeRequestSpy.mock.calls[0][0])
      expect(prepared.omitted).toBe(false)
      expect(prepared.estimatedBodyBytes).toBeLessThan(6_220_000)
      expect(prepared.config.data.valuationResult).toEqual(economics)
      expect(prepared.config.data.htmlReport).toBe(htmlReport)
      expect(freshResult.version.version_data.outputs).toBe(economics)
    })

    it.each([
      undefined,
      {},
      { success: true },
      { success: false, message: 'Not saved' },
    ])('rejects an unacknowledged result response: %j', async (response) => {
      executeRequestSpy.mockResolvedValue(response)
      await expect(
        api.saveValuationResult('val_unacknowledged', {
          valuationResult: { equity_value_mid: 123 },
        })
      ).rejects.toThrow('not acknowledged')
    })

    it('bounds result persistence to the session deadline', async () => {
      executeRequestSpy.mockResolvedValue({
        success: true,
        message: 'saved',
        reportId: 'report-123',
        reportReady: true,
      })

      await api.saveValuationResult('val_timeout', {
        valuationResult: {
          equity_value_mid: 900000,
        } satisfies Partial<ValuationResponse>,
      })

      expect(executeRequestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          url: '/api/v2/valuations/sessions/val_timeout/result',
        }),
        expect.objectContaining({
          timeout: 30_000,
          retry: expect.objectContaining({ maxRetries: 0 }),
        })
      )
    })

    it('ignores caller retry overrides for PUT /result', async () => {
      executeRequestSpy.mockResolvedValue({
        success: true,
        message: 'saved',
        reportId: 'report-123',
        reportReady: true,
      })

      await api.saveValuationResult(
        'val_no_retry',
        {
          valuationResult: {
            equity_value_mid: 900000,
          } satisfies Partial<ValuationResponse>,
        },
        { retry: { maxRetries: 3 } }
      )

      expect(executeRequestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          url: '/api/v2/valuations/sessions/val_no_retry/result',
        }),
        expect.objectContaining({
          timeout: 30_000,
          retry: expect.objectContaining({ maxRetries: 0 }),
        })
      )
    })

    it('surfaces oversized PUT /result instead of marking a partial report save durable', async () => {
      executeRequestSpy.mockRejectedValueOnce({
        response: { status: 413, data: 'Request body is too large' },
      })

      const hugeHtml = `<html>${'x'.repeat(5000)}</html>`

      await expect(
        api.saveValuationResult('val_large', {
          sessionData: {
            company_name: 'Large Corp',
            htmlReport: hugeHtml,
          },
          valuationResult: {
            equity_value_mid: 900000,
            html_report: hugeHtml,
          } satisfies Partial<ValuationResponse>,
          htmlReport: hugeHtml,
        })
      ).rejects.toThrow()

      const firstRequest = executeRequestSpy.mock.calls[0][0] as {
        data: Record<string, unknown>
      }

      expect(executeRequestSpy).toHaveBeenCalledTimes(1)
      expect(firstRequest.data.htmlReport).toBe(hugeHtml)
      expect((firstRequest.data.sessionData as Record<string, unknown>).company_name).toBe(
        'Large Corp'
      )
      expect((firstRequest.data.sessionData as Record<string, unknown>).htmlReport).toBeUndefined()
      expect(
        (firstRequest.data.valuationResult as Record<string, unknown>).html_report
      ).toBeUndefined()
    })
  })
})
