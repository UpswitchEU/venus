import { isPdfTransientUpstreamStatus } from './pdfTransientUpstream'

/** Shared copy for BFF routes and client retry UX — keep in sync with NL toast strings. */
export const TRANSIENT_UPSTREAM_MESSAGE =
  'The valuation service is temporarily busy. Please try again in a moment.'

export function isTransientUpstreamFailure(
  res: Response,
  json?: { message?: string; success?: boolean }
): boolean {
  if (isPdfTransientUpstreamStatus(res.status)) {
    return true
  }
  return !res.ok && json?.message === TRANSIENT_UPSTREAM_MESSAGE
}

export function shouldRetryTransientBffResponse(res: Response, json: unknown): boolean {
  return isTransientUpstreamFailure(
    res,
    typeof json === 'object' && json !== null ? (json as { message?: string }) : undefined
  )
}
