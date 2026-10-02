import { APIError } from '../types/errors'
import {
  parseIndicativeExportRequest,
  reportRecord,
  savedIndicativeRun,
} from '../utils/indicativeReportExport'
import { savedPartialAssessment, savedPartialExportRequest } from '../utils/partialReportExport'
import { isPdfTransientUpstreamStatus } from '../utils/pdfTransientUpstream'
import {
  buildPdfAccessErrorContext,
  getPdfAccessGateMessage,
  getPdfDownloadErrorMessage,
  getPdfGenerationStartErrorMessage,
  type PdfGenerationStartResult,
  PdfRequestRefusedError,
  type PdfStatusPollResult,
  pdfRefusalFromBody,
  resolvePdfGenerationStartResult,
  resolvePdfStatusPollResult,
} from './pdfGenerationModel'

type PdfRequestParams = {
  headers: Record<string, string>
  signal: AbortSignal
}

type ReportPdfRequestParams = PdfRequestParams & {
  reportId: string
  savedReport?: unknown
  language?: string
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
    const refusal = pdfRefusalFromBody(errBody)
    if (refusal) throw new PdfRequestRefusedError(refusal, response.status)
    throw new Error(getPdfGenerationStartErrorMessage(errBody))
  }

  const body: unknown = await response.json()
  const startResult = resolvePdfGenerationStartResult(body)
  if (startResult.status === 'failed' || startResult.status === 'invalid') {
    const refusal = startResult.status === 'failed' ? pdfRefusalFromBody(body) : null
    if (refusal) throw new PdfRequestRefusedError(refusal, response.status)
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
  savedReport,
  language,
}: ReportPdfRequestParams): Promise<Response> {
  const partial = savedPartialAssessment(savedReport)
  const indicative = partial ? null : savedIndicativeRun(savedReport)
  let response: Response
  if (partial) {
    const current = await fetch(
      `/api/valuations/reports/${encodeURIComponent(reportId)}/partial-calculation`,
      { headers, credentials: 'include', signal, cache: 'no-store' }
    )
    if (!current.ok) throw new APIError('Saved partial assessment unavailable', current.status)
    const saved = await current.json()
    const identity = savedPartialExportRequest(saved, language ?? '')
    if (!identity || identity.expected_content_sha256 !== partial.content_sha256)
      throw new Error('Saved calculation changed. Reload before exporting.')
    response = await fetch(
      `/api/valuations/reports/${encodeURIComponent(reportId)}/partial-export`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(identity),
        credentials: 'include',
        signal,
        cache: 'no-store',
      }
    )
    if (response.ok) {
      const body = reportRecord(await response.json())
      const manifest = reportRecord(body.report_manifest)
      if (
        manifest.schema_version !== 'partial_report_manifest.v1' ||
        manifest.report_id !== reportId ||
        manifest.content_sha256 !== identity.expected_content_sha256 ||
        typeof body.pdf_base64 !== 'string'
      )
        throw new Error('Export does not match the saved partial assessment.')
      const raw = atob(body.pdf_base64)
      return new Response(
        Uint8Array.from(raw, (char) => char.charCodeAt(0)),
        { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store' } }
      )
    }
    if (response.status === 409)
      throw new Error('Report revision changed. Reload before exporting.')
  } else if (indicative) {
    const exportUrl = `/api/valuations/reports/${encodeURIComponent(reportId)}/indicative-export`
    const identityResponse = await fetch(
      `${exportUrl}?language=${encodeURIComponent(language ?? '')}`,
      { headers, credentials: 'include', signal, cache: 'no-store' }
    )
    if (!identityResponse.ok) {
      if (isPdfTransientUpstreamStatus(identityResponse.status))
        throw new APIError('PDF download temporarily unavailable', identityResponse.status)
      const body = reportRecord(await identityResponse.json().catch(() => null))
      throw new Error(
        typeof body.error === 'string'
          ? body.error
          : 'Saved report unavailable. Reload before exporting.'
      )
    }
    const identity = parseIndicativeExportRequest(await identityResponse.json())
    if (identity.expected_run_hash !== indicative.run_hash)
      throw new Error('Saved calculation changed. Reload before exporting.')
    response = await fetch(exportUrl, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(identity),
      credentials: 'include',
      signal,
      cache: 'no-store',
    })
    if (response.ok) {
      const body = reportRecord(await response.json())
      const manifest = reportRecord(body.report_manifest)
      if (
        manifest.valuation_run_hash !== identity.expected_run_hash ||
        manifest.report_id !== reportId ||
        manifest.report_scope !== 'automated_indicative' ||
        typeof body.pdf_base64 !== 'string'
      )
        throw new Error('Export does not match the saved report.')
      const raw = atob(body.pdf_base64)
      return new Response(
        Uint8Array.from(raw, (char) => char.charCodeAt(0)),
        { headers: { 'Content-Type': 'application/pdf' } }
      )
    }
    if (response.status === 409)
      throw new Error('Report revision changed. Reload before exporting.')
  } else
    response = await fetch(buildPdfDownloadUrl(reportId), {
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
    const refusal = pdfRefusalFromBody(errBody)
    if (refusal) throw new PdfRequestRefusedError(refusal, response.status)
    throw new Error(errMsg)
  }

  return response
}
