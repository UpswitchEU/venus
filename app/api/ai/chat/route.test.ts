/**
 * BFF tests for POST /api/ai/chat (validation and routing).
 *
 * Covers body validation, auth gating, and stream-vs-chat upstream route selection.
 */

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAiChatRouteMocks,
  POST,
  request,
  resetAiChatRouteHarness,
  restoreAiChatRouteHarness,
  titanJsonResponse,
} from './route.testHarness'

beforeEach(resetAiChatRouteHarness)

afterEach(restoreAiChatRouteHarness)

describe('body validation', () => {
  it('returns 400 with "Invalid JSON body" when body is not parseable JSON', async () => {
    const req = new NextRequest('https://valuation.upswitch.app/api/ai/chat', {
      method: 'POST',
      body: 'not-json-at-all',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'upswitch_access_token=jwt-token-here',
      },
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toEqual({
      success: false,
      error: 'Invalid JSON body',
      fallback: true,
    })
    expect(getAiChatRouteMocks().getBffCookieHeaderForTitan).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns 400 when message is missing, blank, or not a string', async () => {
    for (const body of [{}, { message: '' }, { message: '   \n\t  ' }, { message: 123 }]) {
      const res = await POST(request(body))
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json).toEqual({
        success: false,
        error: 'message is required',
        fallback: true,
      })
    }
    expect(getAiChatRouteMocks().getBffCookieHeaderForTitan).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('auth gate', () => {
  it('returns 401 with fallback:true when cookie has no upswitch_access_token', async () => {
    const req = new NextRequest('https://valuation.upswitch.app/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'hi' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body).toEqual({
      success: false,
      error: 'Authentication required',
      fallback: true,
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns 401 when cookie has other tokens but not upswitch_access_token', async () => {
    const res = await POST(
      request(
        { message: 'hi' },
        {
          cookie: 'some_other_cookie=abc; foo=bar',
        }
      )
    )

    expect(res.status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('stream routing', () => {
  it('defaults to streaming when body.stream is omitted', async () => {
    await POST(request({ message: 'hi' }))

    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toBe('https://api.upswitch.app/api/v2/ai/stream')
  })

  it('routes to streaming when body.stream === true', async () => {
    await POST(request({ message: 'hi', stream: true }))

    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toBe('https://api.upswitch.app/api/v2/ai/stream')
  })

  it('routes to non-streaming chat when body.stream === false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(titanJsonResponse(200, { success: true, content: 'reply' }))
    )

    await POST(request({ message: 'hi', stream: false }))

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toBe('https://api.upswitch.app/api/v2/ai/chat')
    expect((init.headers as Record<string, string>).Accept).toBe('application/json')
  })

  it('forwards X-Ai-Stream-Recovery to Titan for FE non-stream recovery without body flag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(titanJsonResponse(200, { success: true, content: 'recovered' }))
    )

    await POST(
      request({
        message: 'Voeg Decostere toe',
        stream: false,
        recoverFromStreamTurn: true,
        conversationId: 'conv-recovery',
      })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Record<string, string>
    const body = JSON.parse(String(init.body))
    expect(headers['X-Ai-Stream-Recovery']).toBe('1')
    expect(body).not.toHaveProperty('recoverFromStreamTurn')
  })

  it('uses the local Titan URL for localhost Venus requests when no explicit env is set', async () => {
    await POST(request({ message: 'hi' }, {}, 'http://localhost:3001/api/ai/chat'))

    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toBe('http://localhost:3002/api/v2/ai/stream')
  })
})
