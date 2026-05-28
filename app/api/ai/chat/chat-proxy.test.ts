import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AI_CHAT_PROXY_TIMEOUT_MS,
  fetchWithTimeout,
  getOrCreateCorrelationId,
  isTitanAiProxyTimeoutError,
  normalizeCorrelationId,
} from './chat-proxy'

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('resolves when fetch completes before the timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    )

    const response = await fetchWithTimeout('https://api.example.test/chat', { method: 'POST' })

    expect(response.status).toBe(200)
  })

  it('throws AbortError when the timeout elapses first', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          })
        })
      )
    )

    const pending = fetchWithTimeout('https://api.example.test/chat', { method: 'POST' }, 100)
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.runAllTimersAsync()
    await assertion
    expect(isTitanAiProxyTimeoutError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(
      true
    )
  })
})

describe('correlation id helpers', () => {
  it('normalizes unsafe correlation id characters', () => {
    expect(normalizeCorrelationId(' ai corr/123 ')).toBe('ai_corr_123')
    expect(normalizeCorrelationId('   ')).toBeNull()
  })

  it('captures inbound correlation ids or generates a bff-prefixed fallback', () => {
    expect(
      getOrCreateCorrelationId({
        headers: new Headers({ 'X-Correlation-ID': 'venus-corr-1' }),
      })
    ).toBe('venus-corr-1')
    expect(
      getOrCreateCorrelationId({
        headers: new Headers({ 'X-Request-Id': 'req-42' }),
      })
    ).toBe('req-42')
    expect(getOrCreateCorrelationId({ headers: new Headers() })).toMatch(/^bff_[a-f0-9]{12}$/)
  })
})
