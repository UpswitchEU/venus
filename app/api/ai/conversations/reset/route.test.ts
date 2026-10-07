// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ cookies: vi.fn(), fetch: vi.fn() }))
vi.mock('@/utils/bffAuthProxy', () => ({ getBffCookieHeaderForTitan: mocks.cookies }))
vi.mock('@/utils/fetchWithTimeout', () => ({ fetchJsonWithTimeout: mocks.fetch }))

import { POST } from './route'

function request(body: unknown) {
  return new NextRequest('https://valuation.upswitch.app/api/ai/conversations/reset', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'X-Client-User-Id': 'client-user',
      'X-Accountant-User-Id': 'advisor',
      'X-Relationship-Id': 'relationship',
    },
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.cookies.mockResolvedValue({ cookieHeader: 'upswitch_access_token=token' })
})

describe('conversation reset proxy', () => {
  it('forwards the authenticated client scope and returns the server conversation', async () => {
    mocks.fetch.mockResolvedValue({ response: { ok: true }, json: { conversationId: 'fresh' } })
    const response = await POST(request({ reportId: 'client/a' }))
    expect(await response.json()).toEqual({ success: true, conversationId: 'fresh' })
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/ai/conversations/client%2Fa/reset',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token',
          Cookie: 'upswitch_access_token=token',
          'X-Client-User-Id': 'client-user',
          'X-Accountant-User-Id': 'advisor',
          'X-Relationship-Id': 'relationship',
        },
      },
      10000
    )
  })
  it('rejects missing scope and authentication before making a mutation', async () => {
    expect((await POST(request({}))).status).toBe(400)
    mocks.cookies.mockResolvedValue({ cookieHeader: '' })
    expect((await POST(request({ reportId: 'a' }))).status).toBe(401)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('does not claim success on upstream failure or an invalid response', async () => {
    mocks.fetch.mockResolvedValueOnce({ response: { ok: false, status: 403 }, json: {} })
    expect((await POST(request({ reportId: 'a' }))).status).toBe(403)
    mocks.fetch.mockResolvedValueOnce({ response: { ok: true }, json: {} })
    expect((await POST(request({ reportId: 'a' }))).status).toBe(502)
  })
})
