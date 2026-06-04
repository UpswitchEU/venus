import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  getTitanApiUrl: vi.fn(() => 'https://api.upswitch.app'),
}))

vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchJsonWithTimeout: async (...args: unknown[]) => {
    const response = (await mocks.fetchWithTimeout(...args)) as Response
    return { response, json: await response.json().catch(() => null) }
  },
}))

vi.mock('@/utils/getTitanApiUrl', () => ({
  getTitanApiUrl: mocks.getTitanApiUrl,
}))

import { GET as authorize } from './authorize/route'
import { POST as callback } from './callback/route'
import { DELETE as disconnect } from './disconnect/route'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  mocks.fetchWithTimeout.mockReset()
  mocks.getTitanApiUrl.mockClear()
  mocks.getTitanApiUrl.mockReturnValue('https://api.upswitch.app')
})

describe('Silverfin accounting proxy routes', () => {
  it('requires an access cookie before calling Titan', async () => {
    const response = await authorize(
      new NextRequest(
        'https://valuation.upswitch.app/api/integrations/accounting/silverfin/authorize?redirect_uri=https%3A%2F%2Fvaluation.upswitch.app%2Fcallback'
      )
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ message: 'Authentication required' })
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('authorize forwards redirect URI, state, and cookies to Titan', async () => {
    mocks.fetchWithTimeout.mockResolvedValueOnce(
      jsonResponse(200, { authorizeUrl: 'https://silverfin.example/oauth' })
    )

    const response = await authorize(
      new NextRequest(
        'https://valuation.upswitch.app/api/integrations/accounting/silverfin/authorize?redirect_uri=https%3A%2F%2Fvaluation.upswitch.app%2Fcallback&state=abc',
        {
          headers: { cookie: 'upswitch_access_token=jwt-token' },
        }
      )
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ authorizeUrl: 'https://silverfin.example/oauth' })
    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.upswitch.app/integrations/accounting/silverfin/authorize?redirect_uri=https%3A%2F%2Fvaluation.upswitch.app%2Fcallback&state=abc',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'upswitch_access_token=jwt-token',
        },
      },
      15_000
    )
  })

  it('callback preserves Titan error messages', async () => {
    mocks.fetchWithTimeout.mockResolvedValueOnce(jsonResponse(409, { message: 'Already linked' }))

    const response = await callback(
      new NextRequest(
        'https://valuation.upswitch.app/api/integrations/accounting/silverfin/callback',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: 'upswitch_access_token=jwt-token',
          },
          body: JSON.stringify({ code: 'oauth-code' }),
        }
      )
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ message: 'Already linked' })
  })

  it('disconnect returns a 204 without forcing a JSON body', async () => {
    mocks.fetchWithTimeout.mockResolvedValueOnce(new Response(null, { status: 204 }))

    const response = await disconnect(
      new NextRequest('https://valuation.upswitch.app/api/integrations/accounting/silverfin', {
        method: 'DELETE',
        headers: { cookie: 'upswitch_access_token=jwt-token' },
      })
    )

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })

  it('maps upstream timeouts to a controlled 504', async () => {
    mocks.fetchWithTimeout.mockRejectedValueOnce(new Error('Request timeout - please try again'))

    const response = await authorize(
      new NextRequest(
        'https://valuation.upswitch.app/api/integrations/accounting/silverfin/authorize?redirect_uri=https%3A%2F%2Fvaluation.upswitch.app%2Fcallback',
        { headers: { cookie: 'upswitch_access_token=jwt-token' } }
      )
    )

    expect(response.status).toBe(504)
    expect(await response.json()).toEqual({ message: 'Request timed out' })
  })

  it('maps upstream network failures to a controlled 502', async () => {
    mocks.fetchWithTimeout.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const response = await authorize(
      new NextRequest(
        'https://valuation.upswitch.app/api/integrations/accounting/silverfin/authorize?redirect_uri=https%3A%2F%2Fvaluation.upswitch.app%2Fcallback',
        { headers: { cookie: 'upswitch_access_token=jwt-token' } }
      )
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ message: 'Silverfin service unavailable' })
  })
})
