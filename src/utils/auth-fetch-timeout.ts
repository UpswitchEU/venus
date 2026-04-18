/**
 * Client-side fetch with timeout for Venus BFF routes (e.g. `/api/auth/me`).
 * `GET /api/auth/me` may chain refresh + `GET /me` (each `AUTH_FETCH_TIMEOUT_AUTH_ME_MS` = 9s) —
 * client budget must exceed **2×** that worst case (mirrors Mercury `client-fetch-timeout.ts`).
 */
export const CLIENT_AUTH_ME_FETCH_TIMEOUT_MS = 22_000

export async function fetchWithTimeoutClient(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = CLIENT_AUTH_ME_FETCH_TIMEOUT_MS, ...rest } = init
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...rest, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}
