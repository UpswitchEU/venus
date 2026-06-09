import { shouldRetryTransientBffResponse } from './transientUpstreamMessage'

export interface BffJsonResult<T = Record<string, unknown>> {
  res: Response
  json: T
}

export interface FetchBffJsonWithTransientRetryOptions {
  maxAttempts?: number
  initialDelayMs?: number
  maxDelayMs?: number
  timeoutMs?: number
}

export const DEFAULT_BFF_TRANSIENT_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 1_000,
  maxDelayMs: 4_000,
  timeoutMs: 40_000,
} as const

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function shouldRetryBffJsonResult(res: Response, json?: unknown): boolean {
  return shouldRetryTransientBffResponse(res, json ?? {})
}

async function fetchWithClientTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  if (init.signal) {
    if (init.signal.aborted) {
      clearTimeout(timeoutId)
      controller.abort(init.signal.reason)
    } else {
      init.signal.addEventListener('abort', () => controller.abort(init.signal?.reason), {
        once: true,
      })
    }
  }

  try {
    return await fetch(url, {
      ...init,
      credentials: init.credentials ?? 'include',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Fetch a Venus BFF JSON route with bounded retries on transient upstream blips.
 * Safe for idempotent reads and approve (Titan re-approves same user as no-op).
 */
export async function fetchBffJsonWithTransientRetry<T = Record<string, unknown>>(
  url: string,
  init: RequestInit = {},
  options: FetchBffJsonWithTransientRetryOptions = {}
): Promise<BffJsonResult<T>> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_BFF_TRANSIENT_RETRY_OPTIONS.maxAttempts
  const initialDelayMs =
    options.initialDelayMs ?? DEFAULT_BFF_TRANSIENT_RETRY_OPTIONS.initialDelayMs
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_BFF_TRANSIENT_RETRY_OPTIONS.maxDelayMs
  const timeoutMs = options.timeoutMs ?? DEFAULT_BFF_TRANSIENT_RETRY_OPTIONS.timeoutMs

  let delayMs = initialDelayMs
  let lastResult: BffJsonResult<T> | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchWithClientTimeout(url, init, timeoutMs)
      const json = (await res.json().catch(() => ({}))) as T
      lastResult = { res, json }

      if (res.ok || !shouldRetryBffJsonResult(res, json) || attempt >= maxAttempts) {
        return lastResult
      }
    } catch (error) {
      if (attempt >= maxAttempts) {
        throw error
      }
    }

    if (attempt < maxAttempts) {
      await sleep(delayMs)
      delayMs = Math.min(delayMs * 2, maxDelayMs)
    }
  }

  if (!lastResult) {
    throw new Error('BFF fetch failed without a response')
  }
  return lastResult
}
