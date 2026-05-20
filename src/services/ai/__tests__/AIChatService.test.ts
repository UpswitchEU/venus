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
})
