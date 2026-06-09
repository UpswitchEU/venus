/** Titan / BFF statuses that indicate transient pooler or deploy blips — retry, do not hard-fail. */
export const PDF_TRANSIENT_UPSTREAM_STATUSES = new Set([429, 502, 503, 504])

export function isPdfTransientUpstreamStatus(status: number | undefined): boolean {
  return status != null && PDF_TRANSIENT_UPSTREAM_STATUSES.has(status)
}
