import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../stores/clientContext', () => ({
  useClientContext: {
    getState: () => ({
      getContextHeaders: () => ({}),
    }),
  },
}))

vi.mock('../../../utils/logger', () => ({
  createContextLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
  }),
}))

import { aiChatService } from '../AIChatService'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function streamResponse(chunks: string[]): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }
  )
}

function withTimeout<T>(promise: Promise<T>, ms = 1_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for stream')), ms)
    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      }
    )
  })
}

describe('AIChatService', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: true, content: 'ok' }))
    )
  })

  it('forwards locale to the Venus AI BFF', async () => {
    await aiChatService.sendMessage({
      message: 'Hallo',
      locale: 'nl',
      stream: false,
    })

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.locale).toBe('nl')
  })

  it('returns a consent-required envelope on Titan 412 without local fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            code: 'AI_CONSENT_REQUIRED',
            message: 'AI consent is required.',
            currentPolicyVersion: 'ai-chat-v2',
            hasHistoricConsent: false,
            fallback: true,
          },
          412
        )
      )
    )

    const response = await aiChatService.sendMessage({
      message: 'Run the valuation',
      locale: 'en',
      stream: false,
    })

    expect(response).toMatchObject({
      success: false,
      content: '',
      requires_consent: true,
      code: 'AI_CONSENT_REQUIRED',
      currentPolicyVersion: 'ai-chat-v2',
      hasHistoricConsent: false,
      error: 'AI consent is required.',
    })
    expect(response.fallback).toBeUndefined()
  })

  it('returns an auth-required envelope on BFF 401 without local fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            error: 'Authentication required',
            fallback: true,
          },
          401
        )
      )
    )

    const response = await aiChatService.sendMessage({
      message: 'Run the valuation',
      locale: 'en',
      stream: false,
    })

    expect(response).toMatchObject({
      success: false,
      content: '',
      requires_auth: true,
      code: 'AUTH_REQUIRED',
      error: 'Authentication required',
    })
    expect(response.fallback).toBeUndefined()
  })

  it('returns an actionable backend-unreachable envelope without local fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            code: 'AI_BACKEND_UNREACHABLE',
            error:
              'AI backend is not reachable at http://localhost:3002. Start Titan locally and make sure apps/titan-api/.env contains the required auth variables from .env.example.',
            fallback: true,
          },
          503
        )
      )
    )

    const response = await aiChatService.sendMessage({
      message: 'Run the valuation',
      locale: 'en',
      stream: false,
    })

    expect(response).toMatchObject({
      success: false,
      content: '',
      code: 'AI_BACKEND_UNREACHABLE',
      error:
        'AI backend is not reachable at http://localhost:3002. Start Titan locally and make sure apps/titan-api/.env contains the required auth variables from .env.example.',
    })
    expect(response.fallback).toBeUndefined()
  })

  it('routes streaming Titan 412 to onConsentRequired instead of onError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            code: 'AI_CONSENT_REQUIRED',
            message: 'Please enable AI first.',
            currentPolicyVersion: 'ai-chat-v3',
            hasHistoricConsent: true,
          },
          412
        )
      )
    )

    const onError = vi.fn()
    await new Promise<void>((resolve) => {
      aiChatService.streamMessage(
        {
          message: 'Explain EBITDA',
          locale: 'en',
        },
        {
          onError,
          onConsentRequired: (payload) => {
            expect(payload).toEqual({
              message: 'Please enable AI first.',
              currentPolicyVersion: 'ai-chat-v3',
              hasHistoricConsent: true,
            })
            resolve()
          },
        }
      )
    })

    expect(onError).not.toHaveBeenCalled()
  })

  it('routes streaming BFF 401 to onAuthRequired instead of local fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            error: 'Authentication required',
            fallback: true,
          },
          401
        )
      )
    )

    const onError = vi.fn()
    await new Promise<void>((resolve) => {
      aiChatService.streamMessage(
        {
          message: 'Explain EBITDA',
          locale: 'en',
        },
        {
          onError,
          onAuthRequired: (payload) => {
            expect(payload).toEqual({
              message: 'Authentication required',
            })
            resolve()
          },
        }
      )
    })

    expect(onError).not.toHaveBeenCalled()
  })

  it('routes streaming backend failures to the upstream error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            code: 'AI_BACKEND_UNREACHABLE',
            error:
              'AI backend is not reachable at http://localhost:3002. Start Titan locally and make sure apps/titan-api/.env contains the required auth variables from .env.example.',
            fallback: true,
          },
          503
        )
      )
    )

    await new Promise<void>((resolve) => {
      aiChatService.streamMessage(
        {
          message: 'Explain EBITDA',
          locale: 'en',
        },
        {
          onError: (error) => {
            expect(error).toBe(
              'AI backend is not reachable at http://localhost:3002. Start Titan locally and make sure apps/titan-api/.env contains the required auth variables from .env.example.'
            )
            resolve()
          },
        }
      )
    })
  })

  it('flushes a final SSE data line even when Titan omits the trailing newline', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          streamResponse(['data: {"type":"text","content":"Hello","conversationId":"cv-1"}'])
        )
    )

    const onText = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        aiChatService.streamMessage(
          {
            message: 'Say hello',
            locale: 'en',
          },
          {
            onText,
            onError: (error) => {
              onError(error)
              reject(new Error(error))
            },
            onDone: (conversationId) => {
              onDone(conversationId)
              resolve()
            },
          }
        )
      })
    )

    expect(onError).not.toHaveBeenCalled()
    expect(onText).toHaveBeenCalledWith('Hello')
    expect(onDone).toHaveBeenCalledWith('cv-1')
  })

  it('parses complete SSE frames with CRLF comments and multi-line data payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          streamResponse([
            ': keep-alive\r\n',
            'data: {"type":"text",\r\n',
            'data: "content":"Split frame",\r\n',
            'data: "conversationId":"cv-frame"}\r\n\r\n',
            'data: {"type":"done"}',
          ])
        )
    )

    const onText = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        aiChatService.streamMessage(
          {
            message: 'Say hello',
            locale: 'en',
          },
          {
            onText,
            onError: (error) => {
              onError(error)
              reject(new Error(error))
            },
            onDone: (conversationId) => {
              onDone(conversationId)
              resolve()
            },
          }
        )
      })
    )

    expect(onError).not.toHaveBeenCalled()
    expect(onText).toHaveBeenCalledWith('Split frame')
    expect(onDone).toHaveBeenCalledWith('cv-frame')
  })

  it('does not double-fire onDone when a final done chunk has no trailing newline', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          streamResponse([
            'data: {"type":"text","conversationId":"cv-1"}\n\n',
            'data: {"type":"done","conversationId":"cv-done"}',
          ])
        )
    )

    const onDone = vi.fn()
    const onError = vi.fn()

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        aiChatService.streamMessage(
          {
            message: 'Finish',
            locale: 'en',
          },
          {
            onError: (error) => {
              onError(error)
              reject(new Error(error))
            },
            onDone: (conversationId) => {
              onDone(conversationId)
              resolve()
            },
          }
        )
      })
    )

    await Promise.resolve()
    expect(onError).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith('cv-done')
  })
})
