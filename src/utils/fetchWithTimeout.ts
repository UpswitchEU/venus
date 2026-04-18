/**
 * Fetch with timeout for auth proxy routes.
 *
 * Prevents hanging when Titan is unreachable. Use 10s for auth (shorter than
 * long-running operations like complete-profile).
 */

import { AuthUpstreamTimeoutError } from '@/utils/bffAuthProxy'

export { AUTH_FETCH_TIMEOUT_MS } from '@/utils/bffAuthProxy'

export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 10_000
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      let targetHost = 'unknown'
      try {
        targetHost = new URL(url).host
      } catch {
        // keep unknown
      }
      throw new AuthUpstreamTimeoutError(targetHost)
    }
    throw error
  }
}
