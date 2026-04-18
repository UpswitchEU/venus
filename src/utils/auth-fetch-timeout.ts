/**
 * Client-side fetch with timeout for Venus BFF routes (e.g. `/api/auth/me`).
 * `GET /api/auth/me` may chain refresh + `GET /me` (each `AUTH_FETCH_TIMEOUT_AUTH_ME_MS` = 9s) —
 * client budget must exceed **2×** that worst case (mirrors Mercury `client-fetch-timeout.ts`).
 */
export const CLIENT_AUTH_ME_FETCH_TIMEOUT_MS = 22_000

/** POST `/api/auth/refresh` — single BFF hop; mirrors Mercury `CLIENT_AUTH_REFRESH_FETCH_TIMEOUT_MS`. */
export const CLIENT_AUTH_REFRESH_FETCH_TIMEOUT_MS = 22_000

/**
 * If `init.signal` is provided (e.g. the logout abort signal), it is
 * combined with the internal timeout signal so EITHER aborting drops
 * the in-flight response — including its `Set-Cookie` headers, which
 * is critical for refresh requests racing a logout.
 */
export async function fetchWithTimeoutClient(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = CLIENT_AUTH_ME_FETCH_TIMEOUT_MS, signal: externalSignal, ...rest } = init
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  let removeExternalListener: (() => void) | null = null
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(id)
      throw new DOMException('Aborted', 'AbortError')
    }
    const onExternalAbort = () => controller.abort(externalSignal.reason)
    externalSignal.addEventListener('abort', onExternalAbort, { once: true })
    removeExternalListener = () =>
      externalSignal.removeEventListener('abort', onExternalAbort)
  }
  try {
    return await fetch(input, { ...rest, signal: controller.signal })
  } finally {
    clearTimeout(id)
    removeExternalListener?.()
  }
}
