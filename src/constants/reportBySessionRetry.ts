/**
 * Backoff schedule for GET /reports/by-session/:key when the report row is not linked yet (404).
 * Used by ReportAPI, SessionResolver, auth accountant context restore, and fetchWithBySession404Retry.
 */
export const BY_SESSION_404_BACKOFF_MS = [0, 400, 1000, 2000, 3500] as const

/** Titan v2 path segment — use for URL checks so logic stays aligned with ReportAPI routes. */
export const API_V2_REPORTS_BY_SESSION_PATH = '/api/v2/valuations/reports/by-session/'

export function isBySessionReportUrl(url: string): boolean {
  return url.includes(API_V2_REPORTS_BY_SESSION_PATH)
}
