/**
 * Fetch with timeout for auth proxy routes.
 *
 * Prevents hanging when Titan is unreachable. Use 10s for auth (shorter than
 * long-running operations like complete-profile).
 */

export const AUTH_FETCH_TIMEOUT_MS = 10_000

export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = AUTH_FETCH_TIMEOUT_MS
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
      throw new Error('Request timeout - please try again')
    }
    throw error
  }
}
