import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AI_CHAT_PROXY_TIMEOUT_MS,
  buildTitanAiChatProxyPlan,
  fetchWithTimeout,
  getOrCreateCorrelationId,
  isTitanAiProxyTimeoutError,
  normalizeCorrelationId,
  readJsonBodyWithTimeout,
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
      vi.fn(
        (_url: string, init?: RequestInit) =>
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
    expect(
      isTitanAiProxyTimeoutError(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    ).toBe(true)
  })

  it('times out stalled JSON body reads after headers arrive', async () => {
    vi.useFakeTimers()
    const pending = readJsonBodyWithTimeout(
      {
        json: vi.fn(
          () =>
            new Promise(() => {
              // Intentionally never resolves; the body timeout must win.
            })
        ),
      },
      100
    )

    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(101)

    await assertion
  })
})

describe('buildTitanAiChatProxyPlan assistant intent', () => {
  it('forwards assistantIntent into Titan context for calculator quicklinks', () => {
    const result = buildTitanAiChatProxyPlan({
      message: 'Verklaar deze EBITDA',
      sessionId: 'report-1',
      assistantIntent: 'explain_ebitda',
      formData: { companyName: 'Acme' },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected successful plan')
    expect(result.plan.payload.context).toMatchObject({
      assistantIntent: 'explain_ebitda',
    })
  })
})

describe('buildTitanAiChatProxyPlan stream recovery', () => {
  it('sets streamTurnRecovery without forwarding recoverFromStreamTurn to Titan payload', () => {
    const result = buildTitanAiChatProxyPlan({
      message: 'Voeg Decostere toe',
      stream: false,
      recoverFromStreamTurn: true,
      sessionId: 'advisor_u1_workspace',
      conversationId: 'conv-1',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected successful plan')
    expect(result.plan.streamTurnRecovery).toBe(true)
    expect(result.plan.payload).not.toHaveProperty('recoverFromStreamTurn')
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
