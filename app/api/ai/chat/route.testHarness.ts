import { NextRequest } from 'next/server'
import { vi } from 'vitest'
import { AI_CHAT_PROXY_TIMEOUT_MS } from './chat-proxy'

const routeTestMocks = vi.hoisted(() => ({
  getBffCookieHeaderForTitan: vi.fn(),
  apiLogger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/utils/bffAuthProxy', () => ({
  getBffCookieHeaderForTitan: routeTestMocks.getBffCookieHeaderForTitan,
}))

vi.mock('@/utils/logger', () => ({
  apiLogger: routeTestMocks.apiLogger,
}))

export const { POST } = await import('./route')

export function request(
  body: unknown,
  headers: Record<string, string> = {},
  url = 'https://valuation.upswitch.app/api/ai/chat'
): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      cookie: 'upswitch_access_token=jwt-token-here',
      ...headers,
    },
  })
}

export function titanJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function titanStreamResponse(): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"type":"text","content":"hi"}\n\n'))
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

export function titanEmptyStreamResponse(): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.close()
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }
  )
}

export function titanKeepaliveOnlyStreamResponse(): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"_keepalive"}\n\n'))
        controller.close()
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }
  )
}

export function resetAiChatRouteHarness() {
  routeTestMocks.getBffCookieHeaderForTitan.mockReset()
  routeTestMocks.apiLogger.warn.mockReset()
  routeTestMocks.apiLogger.error.mockReset()
  routeTestMocks.getBffCookieHeaderForTitan.mockImplementation(
    async (requestLike: Pick<Request, 'headers'>) => ({
      cookieHeader: requestLike.headers.get('cookie') || '',
      cookieSource: requestLike.headers.get('cookie') ? 'header' : 'cookieStore',
    })
  )
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(titanStreamResponse()))
}

export function getAiChatRouteMocks() {
  return routeTestMocks
}

export function restoreAiChatRouteHarness() {
  vi.useRealTimers()
  vi.unstubAllGlobals()
}

export { AI_CHAT_PROXY_TIMEOUT_MS }
