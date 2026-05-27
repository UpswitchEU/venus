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
      upstreamStatus: 200,
      fetchNonStreamingFallback: mockFetchNonStreamingFallback,
    })

    const text = await readResponseText(wrapped)
    expect(mockFetchNonStreamingFallback).toHaveBeenCalledTimes(1)
    expect(text).toContain('Recovered after invisible stream')
  })
})
