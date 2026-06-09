import type { AxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type APIRequestConfig, HttpClient } from './HttpClient'

type RequestStub = (config: AxiosRequestConfig) => Promise<unknown>

class TestHttpClient extends HttpClient {
  setRequestStub(stub: RequestStub): void {
    ;(this as unknown as { client: { request: RequestStub } }).client.request = stub
  }

  request<T>(config: AxiosRequestConfig, options?: APIRequestConfig): Promise<T> {
    return this.executeRequest<T>(config, options)
  }
}

function tooLargeError(): Error & { isAxiosError: true; response: { status: number } } {
  return Object.assign(new Error('Request body is too large'), {
    isAxiosError: true as const,
    response: { status: 413 },
  })
}

describe('HttpClient valuation result transport guard', () => {
  let client: TestHttpClient

  beforeEach(() => {
    client = new TestHttpClient('https://api.example.test')
  })

  it('preemptively omits oversized report blobs for valuation result saves', async () => {
    const requests: AxiosRequestConfig[] = []
    client.setRequestStub(async (config) => {
      requests.push(config)
      return { status: 200, data: { success: true } }
    })

    const hugeHtml = `<html>${'x'.repeat(10 * 1024 * 1024 + 1024)}</html>`

    await client.request(
      {
        method: 'PUT',
        url: '/api/v2/valuations/sessions/val_large/result',
        data: {
          sessionData: { company_name: 'Large Corp' },
          valuationResult: { equity_value_mid: 900000 },
          htmlReport: hugeHtml,
          pdfHtmlReport: '<html>pdf</html>',
          html_report: '<html>alias</html>',
        },
      },
      { retry: { maxRetries: 0 } }
    )

    expect(requests).toHaveLength(1)
    expect((requests[0].data as Record<string, unknown>).htmlReport).toBeUndefined()
    expect((requests[0].data as Record<string, unknown>).pdfHtmlReport).toBeUndefined()
    expect((requests[0].data as Record<string, unknown>).html_report).toBeUndefined()
    expect((requests[0].data as Record<string, unknown>).sessionData).toMatchObject({
      company_name: 'Large Corp',
    })
  })

  it('retries a 413 valuation result save once without report blobs', async () => {
    const htmlReport = '<html>rendered report</html>'
    const pdfHtmlReport = '<html>pdf rendered report</html>'
    const requests: AxiosRequestConfig[] = []
    const requestStub = vi.fn(async (config: AxiosRequestConfig) => {
      requests.push(config)
      if (requests.length === 1) {
        throw tooLargeError()
      }
      return { status: 200, data: { success: true, reportReady: true } }
    })
    client.setRequestStub(requestStub)

    const result = await client.request<{ success: boolean; reportReady: boolean }>(
      {
        method: 'PUT',
        url: '/api/v2/valuations/sessions/val_retry/result',
        data: {
          sessionData: { company_name: 'Retry Corp' },
          valuationResult: { equity_value_mid: 900000 },
          htmlReport,
          pdfHtmlReport,
        },
      },
      { retry: { maxRetries: 0 } }
    )

    expect(result).toMatchObject({ success: true, reportReady: true })
    expect(requestStub).toHaveBeenCalledTimes(2)
    expect((requests[0].data as Record<string, unknown>).htmlReport).toBe(htmlReport)
    expect((requests[0].data as Record<string, unknown>).pdfHtmlReport).toBe(pdfHtmlReport)
    expect((requests[1].data as Record<string, unknown>).htmlReport).toBeUndefined()
    expect((requests[1].data as Record<string, unknown>).pdfHtmlReport).toBeUndefined()
    expect((requests[1].data as Record<string, unknown>).valuationResult).toMatchObject({
      equity_value_mid: 900000,
    })
  })

  it('passes extended timeout to axios for long-running valuation operations', async () => {
    const requests: AxiosRequestConfig[] = []
    client.setRequestStub(async (config) => {
      requests.push(config)
      return { status: 200, data: { success: true } }
    })

    await client.request(
      {
        method: 'PUT',
        url: '/api/v2/valuations/sessions/val_slow/result',
        data: { htmlReport: '<html>slow</html>' },
      },
      { timeout: 120_000, retry: { maxRetries: 0 } }
    )

    expect(requests[0].timeout).toBe(120_000)
  })

  it('does not retry 503 or 504 responses (upstream pool pressure)', async () => {
    const requestStub = vi.fn(async () => {
      throw Object.assign(new Error('Service unavailable'), {
        isAxiosError: true as const,
        response: { status: 503, data: { message: 'Database temporarily unavailable' } },
      })
    })
    client.setRequestStub(requestStub)

    await expect(
      client.request({ method: 'GET', url: '/api/v2/valuations/sessions/val_pressure' })
    ).rejects.toThrow('Service unavailable')

    expect(requestStub).toHaveBeenCalledTimes(1)
  })
})
