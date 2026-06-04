/**
 * Fetch with timeout for BFF upstream proxy routes.
 *
 * Prevents hanging when Titan or storage is unreachable. The exported
 * `AUTH_FETCH_TIMEOUT_MS` is still the default for short auth/profile routes,
 * while long-running routes can pass a larger timeout.
 */

import { AuthUpstreamTimeoutError } from '@/utils/bffAuthProxy'

export { AUTH_FETCH_TIMEOUT_MS } from '@/utils/bffAuthProxy'

function targetHostFromUrl(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'unknown'
  }
}

function errorName(error: unknown): string | null {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = (error as { name?: unknown }).name
    return typeof name === 'string' ? name : null
  }
  return null
}

function buildTimeoutAbortController(
  url: string,
  incomingSignal: AbortSignal | null | undefined,
  timeoutMs: number
): {
  signal: AbortSignal
  clear: () => void
  isTimeoutAbortError: (error: unknown) => boolean
  timeoutError: () => AuthUpstreamTimeoutError
} {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abortFromIncomingSignal = () => controller.abort(incomingSignal?.reason)

  if (incomingSignal) {
    if (incomingSignal.aborted) {
      abortFromIncomingSignal()
    } else {
      incomingSignal.addEventListener('abort', abortFromIncomingSignal, { once: true })
    }
  }

  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timeoutId)
      incomingSignal?.removeEventListener('abort', abortFromIncomingSignal)
    },
    isTimeoutAbortError: (error: unknown) => errorName(error) === 'AbortError' && timedOut,
    timeoutError: () => new AuthUpstreamTimeoutError(targetHostFromUrl(url)),
  }
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 10_000
): Promise<Response> {
  const abortHandle = buildTimeoutAbortController(url, options.signal, timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: abortHandle.signal,
    })
    return response
  } catch (error) {
    if (abortHandle.isTimeoutAbortError(error)) {
      throw abortHandle.timeoutError()
    }
    throw error
  } finally {
    abortHandle.clear()
  }
}

export async function fetchArrayBufferWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 10_000
): Promise<{ response: Response; arrayBuffer: ArrayBuffer | null }> {
  const abortHandle = buildTimeoutAbortController(url, options.signal, timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: abortHandle.signal,
    })
    if (!response.ok) {
      return { response, arrayBuffer: null }
    }
    const arrayBuffer = await response.arrayBuffer()
    return { response, arrayBuffer }
  } catch (error) {
    if (abortHandle.isTimeoutAbortError(error)) {
      throw abortHandle.timeoutError()
    }
    throw error
  } finally {
    abortHandle.clear()
  }
}

export async function fetchJsonWithTimeout<T = unknown>(
  url: string,
  options: RequestInit,
  timeoutMs: number = 10_000
): Promise<{ response: Response; json: T | null }> {
  const abortHandle = buildTimeoutAbortController(url, options.signal, timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: abortHandle.signal,
    })
    let json: T | null = null
    try {
      json = (await response.json()) as T
    } catch (error) {
      if (abortHandle.isTimeoutAbortError(error)) {
        throw abortHandle.timeoutError()
      }
      if (errorName(error) === 'AbortError') {
        throw error
      }
    }
    return { response, json }
  } catch (error) {
    if (abortHandle.isTimeoutAbortError(error)) {
      throw abortHandle.timeoutError()
    }
    throw error
  } finally {
    abortHandle.clear()
  }
}

export async function fetchTextWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 10_000
): Promise<{ response: Response; text: string | null }> {
  const abortHandle = buildTimeoutAbortController(url, options.signal, timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: abortHandle.signal,
    })
    let text: string | null = null
    try {
      text = await response.text()
    } catch (error) {
      if (abortHandle.isTimeoutAbortError(error)) {
        throw abortHandle.timeoutError()
      }
      if (errorName(error) === 'AbortError') {
        throw error
      }
    }
    return { response, text }
  } catch (error) {
    if (abortHandle.isTimeoutAbortError(error)) {
      throw abortHandle.timeoutError()
    }
    throw error
  } finally {
    abortHandle.clear()
  }
}
