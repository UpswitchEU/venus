/**
 * Turns a session/bootstrap failure into what the error card should say and offer.
 *
 * Bootstrap failures reach the UI as `[CODE] English sentence (retryable)`. Shown
 * verbatim that is a developer string in the middle of a Dutch or French screen,
 * and "Try again" on a report that cannot be opened repeats the same refusal.
 */

export type SessionErrorKind = 'report_unavailable' | 'access_denied' | 'temporary'

export interface SessionErrorDescriptor {
  /** Machine code, kept for support; never the headline. */
  code: string | null
  kind: SessionErrorKind
  /** False when repeating the request cannot change the outcome. */
  allowRetry: boolean
}

const CODED_MESSAGE = /^\s*\[([A-Z][A-Z0-9_]*)\]\s*/

const REPORT_UNAVAILABLE_CODES = new Set(['REPORT_NOT_FOUND', 'SESSION_NOT_FOUND'])
const ACCESS_DENIED_CODES = new Set(['ACCESS_DENIED', 'SESSION_ACCESS_DENIED'])
const TEMPORARY_CODES = new Set(['TIMEOUT', 'DATABASE_ERROR', 'INTERNAL_ERROR'])

export function parseSessionErrorCode(error: string | null | undefined): string | null {
  return error?.match(CODED_MESSAGE)?.[1] ?? null
}

/** The human sentence without the `[CODE]` prefix and the `(retryable)` marker. */
export function stripSessionErrorDiagnostics(error: string): string {
  return error
    .replace(CODED_MESSAGE, '')
    .replace(/\s*\(retryable\)\s*$/i, '')
    .trim()
}

/**
 * `null` means the failure carries no code we recognise: the caller keeps its
 * existing message so an already-localized error is not replaced by a guess.
 */
export function describeSessionError(
  error: string | null | undefined
): SessionErrorDescriptor | null {
  const code = parseSessionErrorCode(error)
  if (!code) return null

  if (REPORT_UNAVAILABLE_CODES.has(code)) {
    return { code, kind: 'report_unavailable', allowRetry: false }
  }
  if (ACCESS_DENIED_CODES.has(code)) {
    return { code, kind: 'access_denied', allowRetry: false }
  }
  if (TEMPORARY_CODES.has(code) || /\(retryable\)\s*$/i.test(error ?? '')) {
    return { code, kind: 'temporary', allowRetry: true }
  }
  return null
}

export type SessionErrorExit = 'client' | 'workspace' | 'start_over'

/** Where the secondary button leads, so its label can say so. */
export function resolveSessionErrorExit(input: {
  isFromMercury: boolean
  hasClientContext: boolean
}): SessionErrorExit {
  if (!input.isFromMercury) return 'start_over'
  return input.hasClientContext ? 'client' : 'workspace'
}
