import {
  BY_SESSION_404_BACKOFF_MS,
  isBySessionReportUrl,
} from '../constants/reportBySessionRetry'

/**
 * GET fetch with optional 404 retries for `/reports/by-session/:key` URLs.
 * Uses the same backoff as ReportAPI and SessionResolver. Each attempt uses its own
 * AbortController timeout (default 8s) so long backoffs do not exhaust a single short deadline.
 */
export async function fetchWithBySession404Retry(
  url: string,
  init: Omit<RequestInit, 'signal'>,
  options?: {
    perAttemptTimeoutMs?: number
    log?: (message: string, context: Record<string, unknown>) => void
  }
): Promise<Response> {
  const isBySession = isBySessionReportUrl(url)
  const maxAttempts = isBySession ? BY_SESSION_404_BACKOFF_MS.length : 1
  const timeoutMs = options?.perAttemptTimeoutMs ?? 8000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, BY_SESSION_404_BACKOFF_MS[attempt]))
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (response.ok) {
        return response
      }
      if (response.status === 404 && isBySession && attempt < maxAttempts - 1) {
        options?.log?.('Report by-session not ready yet, retrying', { attempt, url })
        continue
      }
      return response
    } catch (err) {
      clearTimeout(timeoutId)
      throw err
    }
  }

  throw new Error('Unreachable: fetchWithBySession404Retry')
}
