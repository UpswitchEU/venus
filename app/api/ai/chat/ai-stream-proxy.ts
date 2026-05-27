import { apiLogger } from '@/utils/logger'
import {
  encodeTitanChatResponseAsSseBytes,
  hasVisibleTitanChatPayload,
  sseBytesContainVisibleContent,
  type TitanChatJsonResponse,
} from './chat-to-sse'

function releaseAiSseReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    reader.releaseLock()
  } catch {
    /* stream cleanup must never mask the response path */
  }
}

interface AiSseProxyOptions {
  upstreamStatus: number
  fetchNonStreamingFallback?: () => Promise<Response>
}

export function wrapAiSseBodyForObservability(
  body: ReadableStream<Uint8Array>,
  { upstreamStatus, fetchNonStreamingFallback }: AiSseProxyOptions
): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  const startedAt = Date.now()
  let chunkCount = 0
  let byteCount = 0
  let sawVisibleStreamContent = false

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          if (byteCount === 0 || !sawVisibleStreamContent) {
            apiLogger.warn('[ai.chat] upstream SSE had no visible content', {
              route: '/api/ai/chat',
              upstreamStatus,
              chunkCount,
              byteCount,
              noVisibleContent: byteCount > 0 && !sawVisibleStreamContent,
              totalMs: Date.now() - startedAt,
            })

            if (fetchNonStreamingFallback) {
              try {
                const fallbackResponse = await fetchNonStreamingFallback()
                if (fallbackResponse.ok) {
                  const fallbackPayload =
                    (await fallbackResponse.json()) as TitanChatJsonResponse
                  if (hasVisibleTitanChatPayload(fallbackPayload)) {
                    for (const chunk of encodeTitanChatResponseAsSseBytes(fallbackPayload)) {
                      chunkCount += 1
                      byteCount += chunk.byteLength
                      controller.enqueue(chunk)
                    }
                    apiLogger.warn('[ai.chat] recovered empty SSE via non-streaming chat', {
                      route: '/api/ai/chat',
                      upstreamStatus,
                      chunkCount,
                      byteCount,
                      totalMs: Date.now() - startedAt,
                    })
                  }
                }
              } catch (error) {
                apiLogger.warn('[ai.chat] empty SSE non-streaming fallback failed', {
                  route: '/api/ai/chat',
                  upstreamStatus,
                  chunkCount,
                  byteCount,
                  totalMs: Date.now() - startedAt,
                  error: error instanceof Error ? error.message : String(error),
                })
              }
            }
          }
          controller.close()
          releaseAiSseReader(reader)
          return
        }

        if (value) {
          chunkCount += 1
          byteCount += value.byteLength
          if (!sawVisibleStreamContent && sseBytesContainVisibleContent(value)) {
            sawVisibleStreamContent = true
          }
          controller.enqueue(value)
        }
      } catch (error) {
        apiLogger.warn('[ai.chat] SSE proxy stream failed', {
          route: '/api/ai/chat',
          upstreamStatus,
          chunkCount,
          byteCount,
          totalMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        })
        controller.error(error)
        releaseAiSseReader(reader)
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason)
      } catch (error) {
        apiLogger.warn('[ai.chat] SSE proxy cancel failed', {
          route: '/api/ai/chat',
          upstreamStatus,
          chunkCount,
          byteCount,
          totalMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        })
      } finally {
        releaseAiSseReader(reader)
      }
    },
  })
}
