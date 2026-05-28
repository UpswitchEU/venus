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
})
