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
  // Set when the downstream consumer (the browser) hangs up — navigated away,
  // closed the dock, re-rendered the subtree. Once true, the non-streaming
  // `/chat` recovery is pointless (no one is listening) and would land on
  // Titan as an aborted request (the 499 storm). We also stop touching the
  // controller, which is already being torn down by the cancel path.
  let clientDisconnected = false
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
    // The client already hung up — firing the /chat recovery now just burns
    // a Titan request that aborts (499) with nothing to receive the result.
    if (clientDisconnected) return false

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
    // Client gone — the cancel path owns teardown. Don't run recovery or
    // touch the (already-closing) controller.
    if (clientDisconnected) {
      releaseAiSseReader(reader)
      return
    }
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
        // A read that rejects because the client cancelled is not a stream
        // failure — there's no one to recover for. Bail without firing the
        // /chat fallback (avoids the aborted-499) or erroring the controller.
        if (clientDisconnected) {
          releaseAiSseReader(reader)
          return
        }
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
      // Client/consumer hung up. Stamp WHEN (totalMs via logProxyIssue) and
      // whether any visible content had arrived. This is the missing signal for
      // the staging "~100ms disconnect": a cancel at totalMs≈100 with
      // sawVisibleStreamContent=false confirms the browser/edge drops the SSE
      // before Titan's first token, which is what forces the empty-stream →
      // /chat fallback (and the 499 storm). Logged unconditionally (the existing
      // log below only fires when reader.cancel itself throws).
      logProxyIssue('[ai.chat] client cancelled SSE proxy stream', {
        sawVisibleStreamContent: contentScanner.sawVisibleStreamContent,
        cancelReason:
          typeof reason === 'string'
            ? reason
            : reason instanceof Error
              ? reason.message
              : reason === undefined
                ? undefined
                : String(reason),
      })
      // Set BEFORE awaiting so the pending pull read (which resolves/rejects
      // as a result of this upstream cancel) sees the flag and skips recovery.
      clientDisconnected = true
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
