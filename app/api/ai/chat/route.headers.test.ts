/**
 * BFF tests for POST /api/ai/chat (headers).
 *
 * Covers cookie, bearer, correlation, and client-context header forwarding.
 */

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAiChatRouteMocks,
  POST,
  request,
  resetAiChatRouteHarness,
  restoreAiChatRouteHarness,
} from './route.testHarness'

beforeEach(resetAiChatRouteHarness)

afterEach(restoreAiChatRouteHarness)

describe('header forwarding', () => {
  it('parses the access token out of the cookie and sends Bearer + Cookie to Titan', async () => {
    await POST(request({ message: 'hi' }))

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer jwt-token-here')
    expect(headers.Cookie).toBe('upswitch_access_token=jwt-token-here')
  })

  it('extracts the access token even when surrounded by other cookies', async () => {
    await POST(
      request({ message: 'hi' }, { cookie: 'foo=bar; upswitch_access_token=middle-token; baz=qux' })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer middle-token')
  })

  it('uses merged cookie-store cookies when the raw request header is incomplete', async () => {
    getAiChatRouteMocks().getBffCookieHeaderForTitan.mockResolvedValueOnce({
      cookieHeader: 'upswitch_access_token=store-token; upswitch_refresh_token=store-refresh',
      cookieSource: 'cookieStore',
    })

    await POST(
      new NextRequest('https://valuation.upswitch.app/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'hi' }),
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer store-token')
    expect(headers.Cookie).toBe(
      'upswitch_access_token=store-token; upswitch_refresh_token=store-refresh'
    )
  })

  it('forwards and echoes the AI stream correlation id', async () => {
    const res = await POST(request({ message: 'hi' }, { 'X-Correlation-ID': 'ai-corr-123' }))

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Record<string, string>
    expect(headers['X-Correlation-ID']).toBe('ai-corr-123')
    expect(res.headers.get('X-Correlation-ID')).toBe('ai-corr-123')
  })

  it('sanitizes the incoming correlation id before forwarding or echoing it', async () => {
    const res = await POST(request({ message: 'hi' }, { 'X-Correlation-ID': ' ai corr/123 ' }))

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Record<string, string>
    expect(headers['X-Correlation-ID']).toBe('ai_corr_123')
    expect(res.headers.get('X-Correlation-ID')).toBe('ai_corr_123')
  })

  it('forwards canonical client-context headers (advisor-managed-client routing)', async () => {
    await POST(
      request(
        { message: 'hi' },
        {
          'X-Client-User-Id': 'client-uuid-123',
          'X-Accountant-User-Id': 'accountant-uuid-456',
          'X-Relationship-Id': 'rel-uuid-789',
        }
      )
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Record<string, string>
    expect(headers['X-Client-User-Id']).toBe('client-uuid-123')
    expect(headers['X-Accountant-User-Id']).toBe('accountant-uuid-456')
    expect(headers['X-Relationship-Id']).toBe('rel-uuid-789')
    // Venus emits CANONICAL ONLY (unlike Mercury, which doubles-up).
    expect(headers['X-Client-Context-User']).toBeUndefined()
    expect(headers['X-Client-Context-Accountant']).toBeUndefined()
    expect(headers['X-Client-Context-Relationship']).toBeUndefined()
  })

  it('upgrades legacy client-context inputs to canonical on emit (back-compat in)', async () => {
    await POST(
      request(
        { message: 'hi' },
        {
          'X-Client-Context-User': 'legacy-client',
          'X-Client-Context-Accountant': 'legacy-accountant',
          'X-Client-Context-Relationship': 'legacy-rel',
        }
      )
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Record<string, string>
    expect(headers['X-Client-User-Id']).toBe('legacy-client')
    expect(headers['X-Accountant-User-Id']).toBe('legacy-accountant')
    expect(headers['X-Relationship-Id']).toBe('legacy-rel')
  })

  it('omits client-context headers when none are present', async () => {
    await POST(request({ message: 'hi' }))

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Record<string, string>
    expect(headers['X-Client-User-Id']).toBeUndefined()
  })
})
