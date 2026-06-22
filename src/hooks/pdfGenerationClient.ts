import { APIError } from '../types/errors'
import { isPdfTransientUpstreamStatus } from '../utils/pdfTransientUpstream'
import {
  buildPdfAccessErrorContext,
  getPdfAccessGateMessage,
  getPdfDownloadErrorMessage,
  getPdfGenerationStartErrorMessage,
  type PdfGenerationStartResult,
  type PdfStatusPollResult,
  resolvePdfGenerationStartResult,
  resolvePdfStatusPollResult,
} from './pdfGenerationModel'

type PdfRequestParams = {
  headers: Record<string, string>
  signal: AbortSignal
}

type ReportPdfRequestParams = PdfRequestParams & {
  reportId: string
}

type JobPdfRequestParams = PdfRequestParams & {
  jobId: string
}

export type PdfGenerationAcceptedResult = Extract<
  PdfGenerationStartResult,
  { status: 'queued' | 'ready' }
>

export type PdfStatusRequestResult =
  | PdfStatusPollResult
  | { status: 'access-gated' }
  | { status: 'transient'; httpStatus: number }

export function buildPdfGenerationUrl(reportId: string): string {
  return `/api/valuations/${encodeURIComponent(reportId)}/pdf`
}

export function buildPdfStatusUrl(jobId: string): string {
  return `/api/valuations/pdf/status/${encodeURIComponent(jobId)}`
}

export function buildPdfDownloadUrl(reportId: string, cacheBust: number = Date.now()): string {
  return `/api/valuations/${encodeURIComponent(reportId)}/pdf/download?_=${encodeURIComponent(
    String(cacheBust)
  )}`
}

export async function requestPdfGenerationStart({
  headers,
  reportId,
  signal,
}: ReportPdfRequestParams): Promise<PdfGenerationAcceptedResult> {
  const response = await fetch(buildPdfGenerationUrl(reportId), {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    signal,
  })

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}))
    if (isPdfTransientUpstreamStatus(response.status)) {
      throw new APIError('PDF generation temporarily unavailable', response.status)
    }
    if (response.status === 402) {
      throw new APIError(
        getPdfAccessGateMessage(errBody),
        402,
        undefined,
        true,
        buildPdfAccessErrorContext(errBody)
      )
    }
    throw new Error(getPdfGenerationStartErrorMessage(errBody))
  }

  const startResult = resolvePdfGenerationStartResult(await response.json())
  if (startResult.status === 'failed' || startResult.status === 'invalid') {
    throw new Error(startResult.error)
  }
  return startResult
}

export async function requestPdfStatusPoll({
  headers,
  jobId,
  signal,
}: JobPdfRequestParams): Promise<PdfStatusRequestResult> {
  const response = await fetch(buildPdfStatusUrl(jobId), {
    credentials: 'include',
    headers,
    signal,
  })

  if (!response.ok) {
    if (isPdfTransientUpstreamStatus(response.status)) {
      return { status: 'transient', httpStatus: response.status }
    }
    if (response.status === 402) {
      return { status: 'access-gated' }
    }
    throw new Error('Failed to check status')
  }

  return resolvePdfStatusPollResult(await response.json())
}

export async function requestPdfDownload({
  headers,
  reportId,
  signal,
}: ReportPdfRequestParams): Promise<Response> {
  const response = await fetch(buildPdfDownloadUrl(reportId), {
    credentials: 'include',
    headers,
    signal,
    cache: 'no-store',
  })

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}))
    const errMsg = getPdfDownloadErrorMessage(errBody)
    if (response.status === 402) {
      throw new APIError(errMsg, 402, undefined, true, buildPdfAccessErrorContext(errBody))
    }
    if (isPdfTransientUpstreamStatus(response.status)) {
      throw new APIError('PDF download temporarily unavailable', response.status)
    }
    throw new Error(errMsg)
  }

  return response
}
