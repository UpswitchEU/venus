import { afterEach, describe, expect, it, vi } from 'vitest'
import { APIError } from '../types/errors'
import {
  buildPdfDownloadUrl,
  buildPdfGenerationUrl,
  buildPdfStatusUrl,
  requestPdfDownload,
  requestPdfGenerationStart,
  requestPdfStatusPoll,
} from './pdfGenerationClient'

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
      pdfUrl: 'https://cdn/fresh.pdf',
      status: 'ready',
    })
  })

  it('returns only successful download responses and preserves transient errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'pooler' }, 503))
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
})
