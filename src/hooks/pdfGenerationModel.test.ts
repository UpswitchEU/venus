import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  blobStartsWithPdfMagic,
  buildPdfAccessErrorContext,
  createTimeoutAbortHandle,
  derivePdfPollDelay,
  derivePdfPollProgress,
  describeInvalidPdfPayloadSnippet,
  getPdfAccessGateMessage,
  getPdfDownloadErrorMessage,
  getPdfGenerationStartErrorMessage,
  PDF_STATUS_POLL_INTERVAL_MS,
  PDF_STATUS_POLL_MAX_BACKOFF_MS,
  resolvePdfGenerationStartResult,
  resolvePdfStatusPollResult,
} from './pdfGenerationModel'

function binaryReadableBlob(content: string): Blob {
  const bytes = new TextEncoder().encode(content)
  return {
    size: bytes.byteLength,
    slice: (start = 0, end = bytes.byteLength) => {
      const sliced = bytes.slice(start, end)
      return {
        arrayBuffer: async () => sliced.buffer as ArrayBuffer,
      }
    },
  } as unknown as Blob
}

function textReadableBlob(content: string): Blob {
  return {
    size: content.length,
    slice: (start = 0, end = content.length) => ({
      text: async () => content.slice(start, end),
    }),
  } as unknown as Blob
}

describe('pdfGenerationModel', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('derives bounded polling progress', () => {
    expect(derivePdfPollProgress(0)).toBe(30)
    expect(derivePdfPollProgress(15)).toBe(45)
    expect(derivePdfPollProgress(100)).toBe(90)
  })

  it('derives exponential retry delays with a hard cap', () => {
    expect(derivePdfPollDelay(0)).toBe(PDF_STATUS_POLL_INTERVAL_MS)
    expect(derivePdfPollDelay(1)).toBe(PDF_STATUS_POLL_INTERVAL_MS)
    expect(derivePdfPollDelay(2)).toBe(4_000)
    expect(derivePdfPollDelay(3)).toBe(8_000)
    expect(derivePdfPollDelay(4)).toBe(PDF_STATUS_POLL_MAX_BACKOFF_MS)
    expect(derivePdfPollDelay(20)).toBe(PDF_STATUS_POLL_MAX_BACKOFF_MS)
  })

  it('detects PDF blobs by magic bytes', async () => {
    await expect(blobStartsWithPdfMagic(binaryReadableBlob('%PDF-1.7\nbody'))).resolves.toBe(true)
    await expect(blobStartsWithPdfMagic(textReadableBlob('%PDF-1.7\nbody'))).resolves.toBe(true)
    await expect(blobStartsWithPdfMagic(binaryReadableBlob('<!doctype html>'))).resolves.toBe(false)
    await expect(blobStartsWithPdfMagic(binaryReadableBlob('%PDF'))).resolves.toBe(false)
  })

  it('builds invite-advisor access context without upgrade gating', () => {
    expect(
      buildPdfAccessErrorContext({
        action: 'invite_advisor',
        code: 'INVITE_ADVISOR_REQUIRED',
        inviteAdvisorRequired: true,
        required_tier: 'advisor',
      })
    ).toEqual({
      action: 'invite_advisor',
      code: 'INVITE_ADVISOR_REQUIRED',
      inviteAdvisorRequired: true,
      required_tier: 'advisor',
      upgradeRequired: false,
    })
  })

  it('builds upgrade-required access context for paid plan gates', () => {
    expect(
      buildPdfAccessErrorContext({
        action: 'upgrade',
        code: 'PDF_EXPORT_REQUIRES_PLAN',
        required_tier: 'pro',
      })
    ).toEqual({
      action: 'upgrade',
      code: 'PDF_EXPORT_REQUIRES_PLAN',
      inviteAdvisorRequired: false,
      required_tier: 'pro',
      upgradeRequired: true,
    })
  })

  it('normalizes PDF generation start responses into explicit outcomes', () => {
    expect(
      resolvePdfGenerationStartResult({ success: true, pdfUrl: 'https://cdn/report.pdf' })
    ).toEqual({
      status: 'ready',
      pdfUrl: 'https://cdn/report.pdf',
    })
    expect(resolvePdfGenerationStartResult({ success: true, jobId: 'job-1' })).toEqual({
      status: 'queued',
      jobId: 'job-1',
    })
    expect(
      resolvePdfGenerationStartResult({ success: false, message: 'Titan rejected it' })
    ).toEqual({
      status: 'failed',
      error: 'Titan rejected it',
    })
    expect(resolvePdfGenerationStartResult({ success: true })).toEqual({
      status: 'invalid',
      error: 'No PDF URL or job ID returned — please try again',
    })
  })

  it('normalizes PDF status poll responses into explicit outcomes', () => {
    expect(
      resolvePdfStatusPollResult({ status: 'completed', pdfUrl: 'https://cdn/fresh.pdf' })
    ).toEqual({
      status: 'ready',
      pdfUrl: 'https://cdn/fresh.pdf',
    })
    expect(resolvePdfStatusPollResult({ status: 'failed', error: 'Render failed' })).toEqual({
      status: 'failed',
      error: 'Render failed',
    })
    expect(resolvePdfStatusPollResult({ status: 'completed' })).toEqual({ status: 'pending' })
    expect(resolvePdfStatusPollResult({ status: 'processing' })).toEqual({ status: 'pending' })
  })

  it('extracts stable error messages from PDF protocol bodies', () => {
    expect(getPdfAccessGateMessage({ message: 'Invite an advisor' })).toBe('Invite an advisor')
    expect(getPdfAccessGateMessage({})).toBe(
      'PDF download requires a plan that includes downloadable reports.'
    )
    expect(getPdfGenerationStartErrorMessage({ detail: { code: 'render_timeout' } })).toBe(
      '{"code":"render_timeout"}'
    )
    expect(getPdfDownloadErrorMessage({ error: 'pooler blip' })).toBe('pooler blip')
  })

  it('describes invalid PDF payload snippets without leaking raw HTML noise', () => {
    expect(describeInvalidPdfPayloadSnippet('{"message":"storage denied"}')).toBe('storage denied')
    expect(describeInvalidPdfPayloadSnippet('<!doctype html><title>Forbidden</title>')).toBe(
      'Server returned HTML instead of a PDF.'
    )
    expect(describeInvalidPdfPayloadSnippet('plain upstream failure text')).toBe(
      'plain upstream failure text'
    )
  })

  it('aborts timed requests and reports timeout state', async () => {
    vi.useFakeTimers()
    const handle = createTimeoutAbortHandle(250)

    expect(handle.signal.aborted).toBe(false)
    expect(handle.didTimeout()).toBe(false)

    await vi.advanceTimersByTimeAsync(250)

    expect(handle.signal.aborted).toBe(true)
    expect(handle.didTimeout()).toBe(true)

    handle.cleanup()
  })

  it('cleans up timeout aborts before they fire', async () => {
    vi.useFakeTimers()
    const handle = createTimeoutAbortHandle(250)

    handle.cleanup()
    await vi.advanceTimersByTimeAsync(250)

    expect(handle.signal.aborted).toBe(false)
    expect(handle.didTimeout()).toBe(false)
  })

  it('propagates incoming abort signals', () => {
    vi.useFakeTimers()
    const incoming = new AbortController()
    const handle = createTimeoutAbortHandle(250, incoming.signal)

    incoming.abort()

    expect(handle.signal.aborted).toBe(true)
    expect(handle.didTimeout()).toBe(false)

    handle.cleanup()
  })
})
