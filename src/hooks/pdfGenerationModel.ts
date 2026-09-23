/** Let the BFF return its structured 504 before the browser gives up. */
export const PDF_DOWNLOAD_FETCH_MS = 125_000
export const PDF_STATUS_FETCH_MS = 10_000
export const PDF_STATUS_POLL_INTERVAL_MS = 2_000
export const PDF_STATUS_POLL_MAX_BACKOFF_MS = 16_000
export const PDF_STATUS_MAX_POLL_MS = 5 * 60_000

export type TimeoutAbortHandle = {
  signal: AbortSignal
  abort: () => void
  cleanup: () => void
  didTimeout: () => boolean
}

export type PdfAccessErrorBody = {
  action?: unknown
  code?: unknown
  inviteAdvisorRequired?: unknown
  required_tier?: unknown
  upgradeRequired?: unknown
}

export type PdfGenerationStartResult =
  | { status: 'ready'; pdfUrl: string }
  | { status: 'queued'; jobId: string }
  | { status: 'failed'; error: string }
  | { status: 'invalid'; error: string }

export type PdfStatusPollResult =
  | { status: 'ready'; pdfUrl: string }
  | { status: 'failed'; error: string }
  | { status: 'pending' }

/**
 * Titan's typed refusals for a report that cannot be turned into a document
 * (`SealedReportRenderError`). The UI branches on `code`, never on `message`.
 */
export const PDF_REFUSAL_CODES = [
  'SEALED_VALUATION_RUN_MISSING',
  'SEALED_REPORT_SUPERSEDED',
  'SEALED_REPORT_IDENTITY_MISSING',
  'SEALED_RESULT_TOO_LARGE',
  'SEALED_REPORT_INPUT_INCOMPLETE',
  'SEALED_PROFESSIONAL_REVIEW_INCOMPLETE',
  'SEALED_PUBLICATION_CONTRACT_INVALID',
  'SEALED_LOCALE_UNSUPPORTED',
  'SEALED_ENGINE_RESPONSE_INVALID',
  'PREVIEW_REPORT_CONTENT_MISSING',
  'PREVIEW_ENGINE_REFUSED',
  'PREVIEW_ENGINE_RESPONSE_INVALID',
] as const

export type PdfRefusalCode = (typeof PDF_REFUSAL_CODES)[number]

export function isKnownPdfRefusalCode(code: unknown): code is PdfRefusalCode {
  return typeof code === 'string' && (PDF_REFUSAL_CODES as readonly string[]).includes(code)
}

/** Why the server will not produce this report's PDF, and what the adviser can do about it. */
export interface PdfRefusal {
  code: string | null
  remediation: string
}

/** A PDF request the server refused for a stated reason; retrying unchanged will not help. */
export class PdfRequestRefusedError extends Error {
  readonly refusal: PdfRefusal
  readonly status: number | null

  constructor(refusal: PdfRefusal, status: number | null = null) {
    super(refusal.remediation)
    this.name = 'PdfRequestRefusedError'
    this.refusal = refusal
    this.status = status
  }
}

const PDF_JOB_FAILURE_CODE_SUFFIX = /\s*\[([A-Z][A-Z0-9_]*)\]\s*$/

const PDF_GENERATION_FAILED = 'PDF generation failed'
const PDF_GENERATION_START_FAILED = 'Failed to start PDF generation'
const PDF_GENERATION_MISSING_TARGET = 'No PDF URL or job ID returned — please try again'
const PDF_DOWNLOAD_FAILED = 'Failed to download PDF'
const PDF_ACCESS_GATE_MESSAGE = 'PDF download requires a plan that includes downloadable reports.'
const INVALID_PDF_RESPONSE = 'Download did not return a valid PDF file.'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function firstNonEmptyString(body: unknown, keys: readonly string[], fallback: string): string {
  const record = asRecord(body)
  if (!record) return fallback
  for (const key of keys) {
    const value = nonEmptyString(record[key])
    if (value) return value
  }
  return fallback
}

function firstPresentValue(body: unknown, keys: readonly string[]): unknown {
  const record = asRecord(body)
  if (!record) return undefined
  for (const key of keys) {
    if (Object.hasOwn(record, key)) return record[key]
  }
  return undefined
}

function stringifyMessageValue(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.length > 0) return value
  if (value == null) return fallback
  try {
    const serialized = JSON.stringify(value)
    return serialized && serialized !== 'null' ? serialized : fallback
  } catch {
    return fallback
  }
}

export function createTimeoutAbortHandle(
  timeoutMs: number,
  incomingSignal?: AbortSignal
): TimeoutAbortHandle {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abortFromIncomingSignal = () => controller.abort(incomingSignal?.reason)

  if (incomingSignal) {
    if (incomingSignal.aborted) {
      abortFromIncomingSignal()
    } else {
      incomingSignal.addEventListener('abort', abortFromIncomingSignal, { once: true })
    }
  }

  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    cleanup: () => {
      clearTimeout(timeoutId)
      incomingSignal?.removeEventListener('abort', abortFromIncomingSignal)
    },
    didTimeout: () => timedOut,
  }
}

export async function blobStartsWithPdfMagic(blob: Blob): Promise<boolean> {
  if (blob.size < 8) return false
  const headBlob = blob.slice(0, 5)
  let headBuffer: ArrayBuffer
  if (typeof headBlob.arrayBuffer === 'function') {
    headBuffer = await headBlob.arrayBuffer()
  } else if (typeof headBlob.text === 'function') {
    headBuffer = new TextEncoder().encode(await headBlob.text()).buffer
  } else {
    headBuffer = await new Response(headBlob).arrayBuffer()
  }
  const head = new Uint8Array(headBuffer)
  return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46
}

export function buildPdfAccessErrorContext(errBody: unknown): Record<string, unknown> {
  const body = asRecord(errBody) ?? {}
  const code = typeof body.code === 'string' ? body.code : undefined
  const inviteAdvisorRequired =
    body.inviteAdvisorRequired === true || code === 'INVITE_ADVISOR_REQUIRED'
  return {
    upgradeRequired: inviteAdvisorRequired ? false : true,
    inviteAdvisorRequired,
    ...(code ? { code } : {}),
    ...(typeof body.action === 'string' ? { action: body.action } : {}),
    ...(typeof body.required_tier === 'string' ? { required_tier: body.required_tier } : {}),
  }
}

export function getPdfAccessGateMessage(errBody: unknown): string {
  return firstNonEmptyString(errBody, ['message', 'error'], PDF_ACCESS_GATE_MESSAGE)
}

/**
 * Titan answers a report that cannot be turned into a document with a typed 422 carrying
 * `code`, `message` (the internal precondition) and `remediation` (what the adviser can do
 * about it). Every reader below prefers `remediation`: the adviser needs the next action,
 * not the name of the invariant that failed. A failed queued job carries the same sentence
 * in `error`, followed by the code in brackets.
 */
export function getPdfGenerationStartErrorMessage(errBody: unknown): string {
  return stringifyMessageValue(
    firstPresentValue(errBody, ['remediation', 'message', 'error', 'detail']),
    PDF_GENERATION_START_FAILED
  )
}

export function getPdfDownloadErrorMessage(errBody: unknown): string {
  return firstNonEmptyString(errBody, ['remediation', 'error', 'message'], PDF_DOWNLOAD_FAILED)
}

/** Titan's refusal body (`code` + `remediation`); `null` when the body names no remediation. */
export function pdfRefusalFromBody(body: unknown): PdfRefusal | null {
  const record = asRecord(body)
  const remediation = nonEmptyString(record?.remediation)
  if (!remediation) return null
  return { code: nonEmptyString(record?.code), remediation: remediation.trim() }
}

/** A failed PDF job reports Titan's refusal as `"<remediation> [<CODE>]"`. */
export function pdfRefusalFromJobError(message: string | null | undefined): PdfRefusal | null {
  const text = message?.trim()
  if (!text) return null
  const match = PDF_JOB_FAILURE_CODE_SUFFIX.exec(text)
  if (!match) return null
  const remediation = text.slice(0, match.index).trim()
  return remediation ? { code: match[1], remediation } : null
}

export function resolvePdfGenerationStartResult(body: unknown): PdfGenerationStartResult {
  const data = asRecord(body)

  if (data?.success === false) {
    return {
      status: 'failed',
      error: firstNonEmptyString(data, ['remediation', 'error', 'message'], PDF_GENERATION_FAILED),
    }
  }

  const pdfUrl = nonEmptyString(data?.pdfUrl)
  if (pdfUrl) {
    return { status: 'ready', pdfUrl }
  }

  const jobId = nonEmptyString(data?.jobId)
  if (jobId) {
    return { status: 'queued', jobId }
  }

  return { status: 'invalid', error: PDF_GENERATION_MISSING_TARGET }
}

export function resolvePdfStatusPollResult(body: unknown): PdfStatusPollResult {
  const data = asRecord(body)
  const pdfUrl = nonEmptyString(data?.pdfUrl)

  if (data?.status === 'completed' && pdfUrl) {
    return { status: 'ready', pdfUrl }
  }

  if (data?.status === 'failed') {
    return {
      status: 'failed',
      error: firstNonEmptyString(data, ['remediation', 'error', 'message'], PDF_GENERATION_FAILED),
    }
  }

  return { status: 'pending' }
}

export function describeInvalidPdfPayloadSnippet(snippet: string): string {
  const trimmed = snippet.trim()
  let parsed: { error?: unknown; message?: unknown } | null = null

  try {
    parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown }
  } catch {
    parsed = null
  }

  const parsedMessage = firstNonEmptyString(parsed, ['error', 'message'], '')
  if (parsedMessage) return parsedMessage

  if (trimmed.startsWith('<!')) return 'Server returned HTML instead of a PDF.'

  const textHint = trimmed.slice(0, 120)
  return textHint || INVALID_PDF_RESPONSE
}

export function derivePdfPollProgress(pollCount: number): number {
  return Math.min(30 + Math.max(0, pollCount), 90)
}

export function derivePdfPollDelay(consecutiveTransientErrors: number): number {
  const retryCount = Math.max(1, consecutiveTransientErrors)
  return Math.min(
    PDF_STATUS_POLL_INTERVAL_MS * 2 ** (retryCount - 1),
    PDF_STATUS_POLL_MAX_BACKOFF_MS
  )
}
