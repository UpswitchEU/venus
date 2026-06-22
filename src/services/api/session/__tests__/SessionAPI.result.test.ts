import { beforeEach, describe, expect, it } from 'vitest'
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
      const sessionValuationResult = requestBody.data.sessionData.valuation_result as Record<
        string,
        unknown
      >
      const sessionDetails = sessionValuationResult.details as Record<string, unknown>
      const resultDetails = requestBody.data.valuationResult.details as Record<string, unknown>

      expect(requestBody.data.htmlReport).toBe(hugeHtml)
      expect(requestBody.data.sessionData.htmlReport).toBeUndefined()
      expect(sessionValuationResult.html_report).toBeUndefined()
      expect(sessionDetails.html_report).toBeUndefined()
      expect(requestBody.data.valuationResult.html_report).toBeUndefined()
      expect(requestBody.data.valuationResult.htmlReport).toBeUndefined()
      expect(requestBody.data.valuationResult.pdf_html_report).toBeUndefined()
      expect(resultDetails.html_report).toBeUndefined()
      expect(resultDetails.pdf_html_report).toBeUndefined()
      expect(resultDetails.method).toBe('dcf')
    })

    it('uses extended timeout for PUT /result to match valuation calculate', async () => {
      executeRequestSpy.mockResolvedValue({
        success: true,
        message: 'saved',
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
          timeout: 120_000,
          retry: expect.objectContaining({ maxRetries: 0 }),
        })
      )
    })

    it('ignores caller retry overrides for PUT /result', async () => {
      executeRequestSpy.mockResolvedValue({
        success: true,
        message: 'saved',
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
          timeout: 120_000,
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
