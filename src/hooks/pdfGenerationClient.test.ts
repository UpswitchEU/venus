import { afterEach, describe, expect, it, vi } from 'vitest'
import { APIError } from '../types/errors'
import partialFixtures from '../utils/__fixtures__/partial-assessments.v1.json'
import partialProducer from '../utils/__fixtures__/partial-report.v1.json'
import {
  buildPdfDownloadUrl,
  buildPdfGenerationUrl,
  buildPdfStatusUrl,
  requestPdfDownload,
  requestPdfGenerationStart,
  requestPdfStatusPoll,
} from './pdfGenerationClient'
import { PdfRequestRefusedError } from './pdfGenerationModel'

const headers = { 'X-Relationship-Id': 'rel-1' }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('pdfGenerationClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds encoded PDF BFF routes in one place', () => {
    expect(buildPdfGenerationUrl('report / 1')).toBe('/api/valuations/report%20%2F%201/pdf')
    expect(buildPdfStatusUrl('job / 1')).toBe('/api/valuations/pdf/status/job%20%2F%201')
    expect(buildPdfDownloadUrl('report / 1', 123)).toBe(
      '/api/valuations/report%20%2F%201/pdf/download?_=123'
    )
  })

  it('starts generation with delegated headers and normalizes queued responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, jobId: 'job-1' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      requestPdfGenerationStart({
        headers,
        reportId: 'report-1',
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({ status: 'queued', jobId: 'job-1' })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/valuations/report-1/pdf',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Relationship-Id': 'rel-1',
        }),
        method: 'POST',
      })
    )
  })

  it('preserves access-gate context from generation errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            action: 'invite_advisor',
            code: 'INVITE_ADVISOR_REQUIRED',
            message: 'Invite an advisor',
          },
          402
        )
      )
    )

    await expect(
      requestPdfGenerationStart({
        headers,
        reportId: 'report-1',
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({
      context: {
        action: 'invite_advisor',
        code: 'INVITE_ADVISOR_REQUIRED',
        inviteAdvisorRequired: true,
        upgradeRequired: false,
      },
      message: 'Invite an advisor',
      statusCode: 402,
    } satisfies Partial<APIError>)
  })

  it('turns status polling responses into explicit hook decisions', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'pooler' }, 503))
      .mockResolvedValueOnce(jsonResponse({ error: 'plan' }, 402))
      .mockResolvedValueOnce(jsonResponse({ status: 'pending', error: 'queue settling' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'completed', pdfUrl: 'https://cdn/fresh.pdf' }))
    vi.stubGlobal('fetch', fetchMock)

    const signal = new AbortController().signal

    await expect(requestPdfStatusPoll({ headers, jobId: 'job-1', signal })).resolves.toEqual({
      httpStatus: 503,
      status: 'transient',
    })
    await expect(requestPdfStatusPoll({ headers, jobId: 'job-1', signal })).resolves.toEqual({
      status: 'access-gated',
    })
    await expect(requestPdfStatusPoll({ headers, jobId: 'job-1', signal })).resolves.toEqual({
      status: 'pending',
    })
    await expect(requestPdfStatusPoll({ headers, jobId: 'job-1', signal })).resolves.toEqual({
      pdfUrl: 'https://cdn/fresh.pdf',
      status: 'ready',
    })
  })

  it('returns only successful download responses and preserves transient errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'pooler' }, 503))
      .mockResolvedValueOnce(jsonResponse({ error: 'report changed during rendering' }, 409))
      .mockResolvedValueOnce(new Response('%PDF-1.7', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const signal = new AbortController().signal

    await expect(
      requestPdfDownload({ headers, reportId: 'report-1', signal })
    ).rejects.toMatchObject({
      statusCode: 503,
    })
    await expect(
      requestPdfDownload({ headers, reportId: 'report-1', signal })
    ).rejects.toMatchObject({
      statusCode: 409,
    })
    await expect(
      requestPdfDownload({ headers, reportId: 'report-1', signal })
    ).resolves.toBeInstanceOf(Response)
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/api\/valuations\/report-1\/pdf\/download\?_/),
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'include',
        headers,
      })
    )
  })

  // Titan refuses an unpublishable report with a typed 422 (`code` + `remediation`). The
  // browser must receive both to tell the adviser what to fix instead of "try again".
  const refusalBody = {
    success: false,
    error: 'publication input founding_year missing',
    code: 'SEALED_REPORT_INPUT_INCOMPLETE',
    remediation: 'Complete the client and engagement details, then export again.',
  }

  it('throws a typed refusal when generation is refused for a stated reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(refusalBody, 422)))

    const start = requestPdfGenerationStart({
      headers,
      reportId: 'report-1',
      signal: new AbortController().signal,
    })

    await expect(start).rejects.toBeInstanceOf(PdfRequestRefusedError)
    await expect(start).rejects.toMatchObject({
      status: 422,
      message: refusalBody.remediation,
      refusal: { code: 'SEALED_REPORT_INPUT_INCOMPLETE', remediation: refusalBody.remediation },
    })
  })

  it('throws a typed refusal when the on-demand download regeneration is refused', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(refusalBody, 422)))

    await expect(
      requestPdfDownload({ headers, reportId: 'report-1', signal: new AbortController().signal })
    ).rejects.toMatchObject({
      name: 'PdfRequestRefusedError',
      refusal: { code: 'SEALED_REPORT_INPUT_INCOMPLETE' },
    })
  })

  it('keeps untyped failures as plain errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ success: false, error: 'PDF generation failed' }, 500))
    )

    const start = requestPdfGenerationStart({
      headers,
      reportId: 'report-1',
      signal: new AbortController().signal,
    })
    await expect(start).rejects.toThrow('PDF generation failed')
    await expect(start).rejects.not.toBeInstanceOf(PdfRequestRefusedError)
  })
})

describe('indicative V2 PDF download', () => {
  afterEach(() => vi.unstubAllGlobals())
  const hash = 'a'.repeat(64)
  const savedReport = {
    valuation_result: {
      valuation_run: {
        schema_version: 'valuation_run.v2',
        run_hash: hash,
        response_snapshot: { data_tier: 'indicative' },
      },
    },
  }
  const identity = {
    expected_run_hash: hash,
    expected_updated_at: '2026-10-02T06:00:00.000Z',
    language: 'fr',
    include_pdf: true,
  }
  it('loads the exact persisted identity and forwards delegated context to automatic export', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(identity))
      .mockResolvedValueOnce(
        jsonResponse({
          pdf_base64: btoa('%PDF-1.7\n'),
          report_manifest: {
            report_id: 'report-1',
            valuation_run_hash: hash,
            report_scope: 'automated_indicative',
          },
        })
      )
    vi.stubGlobal('fetch', fetcher)
    const result = await requestPdfDownload({
      headers,
      reportId: 'report-1',
      signal: new AbortController().signal,
      savedReport,
      language: 'fr',
    })
    expect(await result.text()).toBe('%PDF-1.7\n')
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      '/api/valuations/reports/report-1/indicative-export?language=fr'
    )
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/valuations/reports/report-1/indicative-export',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining(headers),
        body: JSON.stringify(identity),
        credentials: 'include',
      })
    )
  })
  it('refuses a different saved run before rendering or using legacy fallback', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ...identity, expected_run_hash: 'b'.repeat(64) }))
    vi.stubGlobal('fetch', fetcher)
    await expect(
      requestPdfDownload({
        headers,
        reportId: 'report-1',
        signal: new AbortController().signal,
        savedReport,
        language: 'fr',
      })
    ).rejects.toThrow('Saved calculation changed')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('preserves stale export refusal without legacy fallback', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(identity))
      .mockResolvedValueOnce(jsonResponse({ message: 'revision changed' }, 409))
    vi.stubGlobal('fetch', fetcher)
    await expect(
      requestPdfDownload({
        headers,
        reportId: 'report-1',
        signal: new AbortController().signal,
        savedReport,
        language: 'fr',
      })
    ).rejects.toThrow('Reload before exporting')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe('ordinary partial assessment PDF download', () => {
  afterEach(() => vi.unstubAllGlobals())
  const reportId = partialProducer.report_manifest.report_id
  const assessment = partialFixtures[0]
  const savedReport = { valuation_result: { partial_valuation: assessment } }
  const loaded = { updated_at: '2026-10-02T06:00:00.000Z', partial_valuation: assessment }
  const params = () => ({
    headers,
    reportId,
    signal: new AbortController().signal,
    savedReport,
    language: 'en',
  })

  it('reloads the saved identity and downloads producer PDF bytes with delegated context', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(loaded))
      .mockResolvedValueOnce(jsonResponse(partialProducer))
    vi.stubGlobal('fetch', fetcher)
    const pdf = await requestPdfDownload(params())
    expect(new Uint8Array(await pdf.arrayBuffer())).toEqual(
      Uint8Array.from(atob(partialProducer.pdf_base64), (c) => c.charCodeAt(0))
    )
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `/api/valuations/reports/${reportId}/partial-calculation`
    )
    expect(fetcher.mock.calls[1]?.[0]).toBe(`/api/valuations/reports/${reportId}/partial-export`)
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining(headers),
      credentials: 'include',
      cache: 'no-store',
    })
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      expected_updated_at: loaded.updated_at,
      expected_content_sha256: assessment.content_sha256,
      language: 'en',
      include_pdf: true,
    })
  })

  it('refuses a changed identity before rendering or invoking legacy download', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({
          ...loaded,
          partial_valuation: { ...assessment, content_sha256: 'b'.repeat(64) },
        })
      )
    vi.stubGlobal('fetch', fetcher)
    await expect(requestPdfDownload(params())).rejects.toThrow('Saved calculation changed')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each([
    402, 409,
  ])('preserves export refusal %s without falling back to a historical PDF', async (status) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(loaded))
      .mockResolvedValueOnce(jsonResponse({ message: 'Reload or select an eligible plan' }, status))
    vi.stubGlobal('fetch', fetcher)
    const result = requestPdfDownload(params())
    if (status === 402) await expect(result).rejects.toMatchObject({ statusCode: 402 })
    else await expect(result).rejects.toThrow('Reload before exporting')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
