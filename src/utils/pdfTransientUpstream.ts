/** Titan / BFF statuses that indicate retryable PDF infrastructure or save-race blips. */
export const PDF_TRANSIENT_UPSTREAM_STATUSES = new Set([409, 429, 502, 503, 504])

export function isPdfTransientUpstreamStatus(status: number | undefined): boolean {
  return status != null && PDF_TRANSIENT_UPSTREAM_STATUSES.has(status)
}
