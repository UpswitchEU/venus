import { apiLogger } from '@/utils/logger'
import {
  createSseStreamContentScanner,
  encodeStreamFallbackErrorSseBytes,
  encodeStreamRecoveryMetaSseBytes,
  encodeTitanChatResponseAsSseBytes,
  hasVisibleTitanChatPayload,
  type TitanChatJsonResponse,
} from './chat-to-sse'

function releaseAiSseReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    reader.releaseLock()
  } catch {
    /* stream cleanup must never mask the response path */
  }
}

type StreamRecoveryOutcome =
  | 'none'
  | 'bff-fallback'
  | 'bff-fallback-failed'
  | 'bff-stream-incomplete'
  | 'error-sse-emitted'

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
  let streamRecovery: StreamRecoveryOutcome = 'none'
  const contentScanner = createSseStreamContentScanner()

  const logProxyIssue = (
    message: string,
    extra?: Record<string, unknown> & { streamRecovery?: StreamRecoveryOutcome }
  ) => {
    apiLogger.warn(message, {
      route: '/api/ai/chat',
      correlationId,
      upstreamStatus,
      chunkCount,
      byteCount,
      totalMs: Date.now() - startedAt,
      ...(extra?.streamRecovery ? { streamRecovery: extra.streamRecovery } : {}),
      ...extra,
    })
  }

  const enqueueBytes = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    bytes: Uint8Array[]
  ) => {
    for (const chunk of bytes) {
      chunkCount += 1
      byteCount += chunk.byteLength
      controller.enqueue(chunk)
    }
  }

  const emitStreamRecoveryMeta = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    source: 'bff-fallback' | 'bff-fallback-failed' | 'bff-stream-incomplete'
  ) => {
    enqueueBytes(controller, encodeStreamRecoveryMetaSseBytes(source))
  }

  const emitTerminalError = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    enqueueBytes(controller, encodeStreamFallbackErrorSseBytes())
    streamRecovery = 'error-sse-emitted'
    logProxyIssue('[ai.chat] emitted terminal error SSE for client recovery', {
      streamRecovery,
    })
  }

  const attemptNonStreamingFallback = async (
    controller: ReadableStreamDefaultController<Uint8Array>,
    recoveryContext: 'empty' | 'incomplete' = 'empty'
  ): Promise<boolean> => {
    if (!fetchNonStreamingFallback) return false

    streamRecovery = 'bff-fallback'
    try {
      const fallbackResponse = await fetchNonStreamingFallback()
      if (fallbackResponse.ok) {
        const fallbackPayload = (await fallbackResponse.json()) as TitanChatJsonResponse
        if (hasVisibleTitanChatPayload(fallbackPayload)) {
          emitStreamRecoveryMeta(controller, 'bff-fallback')
          enqueueBytes(controller, encodeTitanChatResponseAsSseBytes(fallbackPayload))
          logProxyIssue(
            recoveryContext === 'incomplete'
              ? '[ai.chat] recovered incomplete SSE via non-streaming chat'
              : '[ai.chat] recovered empty SSE via non-streaming chat',
            {
              streamRecovery: 'bff-fallback',
            }
          )
          return true
        }
        streamRecovery = 'bff-fallback-failed'
        logProxyIssue('[ai.chat] empty SSE non-streaming fallback had no visible payload', {
          streamRecovery,
          fallbackStatus: fallbackResponse.status,
        })
        return false
      }
      streamRecovery = 'bff-fallback-failed'
      logProxyIssue('[ai.chat] empty SSE non-streaming fallback failed', {
        streamRecovery,
        fallbackStatus: fallbackResponse.status,
      })
      return false
    } catch (error) {
      streamRecovery = 'bff-fallback-failed'
      logProxyIssue('[ai.chat] empty SSE non-streaming fallback failed', {
        streamRecovery,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  const finalizeStream = async (controller: ReadableStreamDefaultController<Uint8Array>) => {
    contentScanner.flush()
    const sawVisibleStreamContent = contentScanner.sawVisibleStreamContent
    const sawStreamCompletion = contentScanner.sawStreamCompletion

    if (sawVisibleStreamContent && !sawStreamCompletion) {
      const recovered = await attemptNonStreamingFallback(controller, 'incomplete')
      if (!recovered) {
        streamRecovery = 'bff-stream-incomplete'
        emitStreamRecoveryMeta(controller, 'bff-stream-incomplete')
        logProxyIssue('[ai.chat] upstream SSE ended incomplete after visible content', {
          streamRecovery,
        })
      }
    } else if (!sawVisibleStreamContent) {
      logProxyIssue('[ai.chat] upstream SSE had no visible content', {
        noVisibleContent: byteCount > 0,
      })

      const recovered = await attemptNonStreamingFallback(controller)
      if (!recovered) {
        if (streamRecovery === 'bff-fallback-failed') {
          emitStreamRecoveryMeta(controller, 'bff-fallback-failed')
        }
        emitTerminalError(controller)
      }
    }

    controller.close()
    releaseAiSseReader(reader)
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          await finalizeStream(controller)
          return
        }

        if (value) {
          chunkCount += 1
          byteCount += value.byteLength
          contentScanner.push(value)
          controller.enqueue(value)
        }
      } catch (error) {
        contentScanner.flush()
        const sawVisibleStreamContent = contentScanner.sawVisibleStreamContent
        const sawStreamCompletion = contentScanner.sawStreamCompletion

        if (!sawStreamCompletion) {
          if (sawVisibleStreamContent) {
            const recovered = await attemptNonStreamingFallback(controller, 'incomplete')
            if (!recovered) {
              streamRecovery = 'bff-stream-incomplete'
              emitStreamRecoveryMeta(controller, 'bff-stream-incomplete')
              logProxyIssue('[ai.chat] upstream SSE ended incomplete after visible content', {
                streamRecovery,
                error: error instanceof Error ? error.message : String(error),
              })
            }
            controller.close()
            releaseAiSseReader(reader)
            return
          }

          logProxyIssue('[ai.chat] upstream SSE had no visible content', {
            noVisibleContent: byteCount > 0,
            error: error instanceof Error ? error.message : String(error),
          })
          const recovered = await attemptNonStreamingFallback(controller)
          if (!recovered) {
            if (streamRecovery === 'bff-fallback-failed') {
              emitStreamRecoveryMeta(controller, 'bff-fallback-failed')
            }
            emitTerminalError(controller)
          }
          controller.close()
          releaseAiSseReader(reader)
          return
        }

        logProxyIssue('[ai.chat] SSE proxy stream failed', {
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
        logProxyIssue('[ai.chat] SSE proxy cancel failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      } finally {
        releaseAiSseReader(reader)
      }
    },
  })
}
