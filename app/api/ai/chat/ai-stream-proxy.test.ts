import { beforeEach, describe, expect, it, vi } from 'vitest'
import { wrapAiSseBodyForObservability } from './ai-stream-proxy'

const mockFetchNonStreamingFallback = vi.fn()

async function readResponseText(body: ReadableStream<Uint8Array> | null) {
  if (!body) throw new Error('missing body')
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return new TextDecoder().decode(
    chunks.reduce((acc, chunk) => {
      const merged = new Uint8Array(acc.length + chunk.length)
      merged.set(acc)
      merged.set(chunk, acc.length)
      return merged
    }, new Uint8Array())
  )
}

describe('wrapAiSseBodyForObservability', () => {
  beforeEach(() => {
    mockFetchNonStreamingFallback.mockReset()
  })

  it('synthesizes SSE from non-streaming chat when upstream only sent keepalive frames', async () => {
    mockFetchNonStreamingFallback.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          content: 'Recovered after invisible stream',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"_keepalive"}\n\n'))
        controller.close()
      },
    })

    const wrapped = wrapAiSseBodyForObservability(upstream, {
      correlationId: 'corr-1',
      upstreamStatus: 200,
      fetchNonStreamingFallback: mockFetchNonStreamingFallback,
    })

    const text = await readResponseText(wrapped)
    expect(mockFetchNonStreamingFallback).toHaveBeenCalledTimes(1)
    expect(text).toContain('"type":"stream_recovery"')
    expect(text).toContain('Recovered after invisible stream')
  })

  it('emits a terminal error SSE frame when non-streaming fallback fails', async () => {
    mockFetchNonStreamingFallback.mockResolvedValue(new Response(null, { status: 499 }))

    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    })

    const wrapped = wrapAiSseBodyForObservability(upstream, {
      correlationId: 'corr-1',
      upstreamStatus: 200,
      fetchNonStreamingFallback: mockFetchNonStreamingFallback,
    })

    const text = await readResponseText(wrapped)
    expect(mockFetchNonStreamingFallback).toHaveBeenCalledTimes(1)
    expect(text).toContain('"type":"stream_recovery"')
    expect(text).toContain('bff-fallback-failed')
    expect(text).toContain('AI stream fallback failed')
  })

  it('emits terminal error SSE when non-streaming fallback returns no visible payload', async () => {
    mockFetchNonStreamingFallback.mockResolvedValue(
      new Response(JSON.stringify({ success: true, content: '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"_keepalive"}\n\n'))
        controller.close()
      },
    })

    const wrapped = wrapAiSseBodyForObservability(upstream, {
      correlationId: 'corr-2',
      upstreamStatus: 200,
      fetchNonStreamingFallback: mockFetchNonStreamingFallback,
    })

    const text = await readResponseText(wrapped)
    expect(mockFetchNonStreamingFallback).toHaveBeenCalledTimes(1)
    expect(text).toContain('"type":"stream_recovery"')
    expect(text).toContain('bff-fallback-failed')
    expect(text).toContain('AI stream fallback failed')
    expect(text).not.toContain('Recovered after invisible stream')
  })

  it('recovers incomplete streams via non-streaming chat when the fallback hook succeeds', async () => {
    mockFetchNonStreamingFallback.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          content: 'KBO-resultaat voor Decostere',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"type":"text","content":"Partial announcement"}\n\n'
          )
        )
        controller.close()
      },
    })

    const wrapped = wrapAiSseBodyForObservability(upstream, {
      correlationId: 'corr-incomplete-recovered',
      upstreamStatus: 200,
      fetchNonStreamingFallback: mockFetchNonStreamingFallback,
    })

    const text = await readResponseText(wrapped)
    expect(mockFetchNonStreamingFallback).toHaveBeenCalledTimes(1)
    expect(text).toContain('Partial announcement')
    expect(text).toContain('bff-fallback')
    expect(text).toContain('KBO-resultaat voor Decostere')
    expect(text).not.toContain('bff-stream-incomplete')
  })

  it('emits bff-stream-incomplete when visible content arrives without done and fallback fails', async () => {
    mockFetchNonStreamingFallback.mockResolvedValue(new Response(null, { status: 503 }))

    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"type":"text","content":"Partial announcement"}\n\n'
          )
        )
        controller.close()
      },
    })

    const wrapped = wrapAiSseBodyForObservability(upstream, {
      correlationId: 'corr-incomplete',
      upstreamStatus: 200,
      fetchNonStreamingFallback: mockFetchNonStreamingFallback,
    })

    const text = await readResponseText(wrapped)
    expect(mockFetchNonStreamingFallback).toHaveBeenCalledTimes(1)
    expect(text).toContain('bff-stream-incomplete')
  })

  it('does not fire the non-streaming fallback after the client disconnects', async () => {
    // The 499 storm: Titan opens the SSE (keepalive) and is still doing slow
    // consent/credit/DB setup when the client hangs up (navigated away, closed
    // the dock). The old code then fired the /chat recovery into the void — it
    // aborted on Titan as a 499. With the disconnect guard, no fallback fires.
    mockFetchNonStreamingFallback.mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, content: 'must never be sent to a gone client' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    let upstreamCancelled = false
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"_keepalive"}\n\n'))
        // Deliberately left open — Titan is mid-setup, no visible token yet.
      },
      cancel() {
        upstreamCancelled = true
      },
    })

    const wrapped = wrapAiSseBodyForObservability(upstream, {
      correlationId: 'corr-client-disconnect',
      upstreamStatus: 200,
      fetchNonStreamingFallback: mockFetchNonStreamingFallback,
    })

    const reader = wrapped.getReader()
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toContain('_keepalive')

    // Pending read puts the proxy's pull() in its awaiting-upstream state —
    // the exact moment the fallback used to fire when the client then leaves.
    const pending = reader.read()
    await Promise.resolve()
    await reader.cancel('client navigated away')
    await pending.catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(upstreamCancelled).toBe(true)
    expect(mockFetchNonStreamingFallback).not.toHaveBeenCalled()
  })
})
