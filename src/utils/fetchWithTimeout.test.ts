import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchArrayBufferWithTimeout,
  fetchJsonWithTimeout,
  fetchTextWithTimeout,
} from './fetchWithTimeout'

describe('fetchWithTimeout utilities', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not read a response body when the response is not ok', async () => {
    const arrayBuffer = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, arrayBuffer } as unknown as Response))
    )

    const result = await fetchArrayBufferWithTimeout('https://cdn.upswitch.app/report.pdf', {}, 50)

    expect(result.response.ok).toBe(false)
    expect(result.arrayBuffer).toBeNull()
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  it('keeps the timeout active while reading an ok response body', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal ?? null
        return Promise.resolve({
          ok: true,
          arrayBuffer: () =>
            new Promise<ArrayBuffer>((_resolve, reject) => {
              signal?.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'))
              })
            }),
        } as unknown as Response)
      })
    )

    const request = fetchArrayBufferWithTimeout('https://cdn.upswitch.app/report.pdf', {}, 50)
    await Promise.resolve()
    await Promise.resolve()

    const expectation = expect(request).rejects.toMatchObject({
      name: 'AuthUpstreamTimeoutError',
      targetHost: 'cdn.upswitch.app',
    })
    await vi.advanceTimersByTimeAsync(51)

    await expectation
  })

  it('keeps the timeout active while reading a JSON response body', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal ?? null
        return Promise.resolve({
          ok: true,
          json: () =>
            new Promise<unknown>((_resolve, reject) => {
              signal?.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'))
              })
            }),
        } as unknown as Response)
      })
    )

    const request = fetchJsonWithTimeout('https://api.upswitch.app/pdf', {}, 50)
    await Promise.resolve()
    await Promise.resolve()

    const expectation = expect(request).rejects.toMatchObject({
      name: 'AuthUpstreamTimeoutError',
      targetHost: 'api.upswitch.app',
    })
    await vi.advanceTimersByTimeAsync(51)

    await expectation
  })

  it('returns null JSON for malformed JSON bodies without hiding aborts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.reject(new SyntaxError('bad json')),
        } as unknown as Response)
      )
    )

    const result = await fetchJsonWithTimeout('https://api.upswitch.app/pdf', {}, 50)

    expect(result.response.ok).toBe(true)
    expect(result.json).toBeNull()
  })

  it('keeps the timeout active while reading a text response body', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal ?? null
        return Promise.resolve({
          ok: true,
          text: () =>
            new Promise<string>((_resolve, reject) => {
              signal?.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'))
              })
            }),
        } as unknown as Response)
      })
    )

    const request = fetchTextWithTimeout('https://www.upswitch.app/import', {}, 50)
    await Promise.resolve()
    await Promise.resolve()

    const expectation = expect(request).rejects.toMatchObject({
      name: 'AuthUpstreamTimeoutError',
      targetHost: 'www.upswitch.app',
    })
    await vi.advanceTimersByTimeAsync(51)

    await expectation
  })
})
