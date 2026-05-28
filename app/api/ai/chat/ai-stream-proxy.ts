import { apiLogger } from '@/utils/logger'
import {
  encodeStreamFallbackErrorSseBytes,
  encodeStreamRecoveryMetaSseBytes,
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

type StreamRecoveryOutcome = 'none' | 'bff-fallback' | 'bff-fallback-failed' | 'error-sse-emitted'

interface AiSseProxyOptions {
  correlationId: string
  upstreamStatus: number
  fetchNonStreamingFallback?: () => Promise<Response>
}

export function wrapAiSseBodyForObservability(
  body: ReadableStream<Uint8Array>,
  { correlationId, upstreamStatus, fetchNonStreamingFallback }: AiSseProxyOptions
): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  const startedAt = Date.now()
  let chunkCount = 0
  let byteCount = 0
  let sawVisibleStreamContent = false
  let streamRecovery: StreamRecoveryOutcome = 'none'

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          if (!sawVisibleStreamContent) {
            apiLogger.warn('[ai.chat] upstream SSE had no visible content', {
              route: '/api/ai/chat',
              correlationId,
              upstreamStatus,
              chunkCount,
              byteCount,
              noVisibleContent: byteCount > 0,
              totalMs: Date.now() - startedAt,
            })

            if (fetchNonStreamingFallback) {
              streamRecovery = 'bff-fallback'
              try {
                const fallbackResponse = await fetchNonStreamingFallback()
                if (fallbackResponse.ok) {
                  const fallbackPayload =
                    (await fallbackResponse.json()) as TitanChatJsonResponse
                  if (hasVisibleTitanChatPayload(fallbackPayload)) {
                    for (const chunk of encodeStreamRecoveryMetaSseBytes('bff-fallback')) {
                      chunkCount += 1
                      byteCount += chunk.byteLength
                      controller.enqueue(chunk)
                    }
                    for (const chunk of encodeTitanChatResponseAsSseBytes(fallbackPayload)) {
                      chunkCount += 1
                      byteCount += chunk.byteLength
                      sawVisibleStreamContent = true
                      controller.enqueue(chunk)
                    }
                    apiLogger.warn('[ai.chat] recovered empty SSE via non-streaming chat', {
                      route: '/api/ai/chat',
                      correlationId,
                      upstreamStatus,
                      streamRecovery: 'bff-fallback',
                      chunkCount,
                      byteCount,
                      totalMs: Date.now() - startedAt,
                    })
                  } else {
                    streamRecovery = 'bff-fallback-failed'
                    apiLogger.warn('[ai.chat] empty SSE non-streaming fallback had no visible payload', {
                      route: '/api/ai/chat',
                      correlationId,
                      upstreamStatus,
                      streamRecovery,
                      fallbackStatus: fallbackResponse.status,
                      chunkCount,
                      byteCount,
                      totalMs: Date.now() - startedAt,
                    })
                  }
                } else {
                  streamRecovery = 'bff-fallback-failed'
                  apiLogger.warn('[ai.chat] empty SSE non-streaming fallback failed', {
                    route: '/api/ai/chat',
                    correlationId,
                    upstreamStatus,
                    streamRecovery,
                    fallbackStatus: fallbackResponse.status,
                    chunkCount,
                    byteCount,
                    totalMs: Date.now() - startedAt,
                  })
                }
              } catch (error) {
                streamRecovery = 'bff-fallback-failed'
                apiLogger.warn('[ai.chat] empty SSE non-streaming fallback failed', {
                  route: '/api/ai/chat',
                  correlationId,
                  upstreamStatus,
                  streamRecovery,
                  chunkCount,
                  byteCount,
                  totalMs: Date.now() - startedAt,
                  error: error instanceof Error ? error.message : String(error),
                })
              }
            }

            if (!sawVisibleStreamContent) {
              if (streamRecovery === 'bff-fallback-failed') {
                for (const chunk of encodeStreamRecoveryMetaSseBytes('bff-fallback-failed')) {
                  chunkCount += 1
                  byteCount += chunk.byteLength
                  controller.enqueue(chunk)
                }
              }
              for (const chunk of encodeStreamFallbackErrorSseBytes()) {
                chunkCount += 1
                byteCount += chunk.byteLength
                controller.enqueue(chunk)
              }
              streamRecovery = 'error-sse-emitted'
              apiLogger.warn('[ai.chat] emitted terminal error SSE for client recovery', {
                route: '/api/ai/chat',
                correlationId,
                upstreamStatus,
                streamRecovery,
                chunkCount,
                byteCount,
                totalMs: Date.now() - startedAt,
              })
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
          correlationId,
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
          correlationId,
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
