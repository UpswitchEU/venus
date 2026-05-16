import { BY_SESSION_404_BACKOFF_MS, isBySessionReportUrl } from '../constants/reportBySessionRetry'

/**
 * Read the `transient` flag from a 404 response body without consuming the
 * response stream the caller will eventually hand back. The body is cloned
 * so the original response remains readable downstream. Returns:
 *   - `false` → permanent miss; the retry cascade must short-circuit.
 *   - `true` | `undefined` → caller should keep retrying as before
 *     (treat absent flag as transient to preserve legacy behavior).
 *
 * Defensive: any JSON parse error or non-object body falls back to
 * `undefined` so a malformed response never blocks the retry path.
 */
async function peekTransientFlag(response: Response): Promise<boolean | undefined> {
  try {
    const clone = response.clone()
    const text = await clone.text()
    if (!text) return undefined
    const body = JSON.parse(text) as unknown
    if (body && typeof body === 'object' && 'transient' in body) {
      const flag = (body as { transient?: unknown }).transient
      if (typeof flag === 'boolean') return flag
    }
    return undefined
  } catch {
    return undefined
  }
}

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
        // Short-circuit: Titan tags by-session 404s with `transient: false`
        // when the report is deleted, soft-deleted, access-denied, or the
        // session row doesn't exist. Retrying can't help — return the
        // response immediately so the caller can surface the error.
        // Without this, every navigation to a deleted/never-existed
        // report wastes ~6.9s (sum of BY_SESSION_404_BACKOFF_MS) on
        // useless retries (METANOUS regression: deleting a report and
        // navigating back from Mercury → Venus hung for ~30s, of which
        // ~7s came from this cascade).
        const transientFlag = await peekTransientFlag(response)
        if (transientFlag === false) {
          options?.log?.('Report by-session permanently unavailable, skipping retries', {
            attempt,
            url,
          })
          return response
        }
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
