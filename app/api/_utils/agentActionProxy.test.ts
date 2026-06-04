import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  getBffCookieHeaderForTitan: vi.fn(),
  getTitanApiUrl: vi.fn(() => 'https://api.upswitch.app'),
}))

vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
  fetchJsonWithTimeout: async (...args: unknown[]) => {
    const response = (await mocks.fetchWithTimeout(...args)) as Response
    return { response, json: await response.json().catch(() => null) }
  },
}))

vi.mock('@/utils/bffAuthProxy', () => ({
  getBffCookieHeaderForTitan: mocks.getBffCookieHeaderForTitan,
}))

vi.mock('@/utils/getTitanApiUrl', () => ({
  getTitanApiUrl: mocks.getTitanApiUrl,
}))

import { encodeTitanPathSegment, proxyAgentJsonToTitan } from './agentActionProxy'

function request(headers: Record<string, string> = {}) {
  return new NextRequest('https://valuation.upswitch.app/api/listings/listing-1/share-tokens', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

function titanJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  mocks.fetchWithTimeout.mockReset()
  mocks.getBffCookieHeaderForTitan.mockReset()
  mocks.getTitanApiUrl.mockClear()
  mocks.getTitanApiUrl.mockReturnValue('https://api.upswitch.app')
})

describe('agent action proxy', () => {
  it('encodes Titan path segments before route handlers build upstream paths', () => {
    expect(encodeTitanPathSegment('listing/with spaces')).toBe('listing%2Fwith%20spaces')
  })

  it('returns 401 before calling Titan when the BFF cookie header lacks an access token', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_refresh_token=refresh-only',
      cookieSource: 'header',
    })

    const response = await proxyAgentJsonToTitan(
      request(),
      '/api/v2/listings/listing-1/share-tokens',
      {
        method: 'POST',
        body: { scope: 'advisor' },
      }
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      success: false,
      message: 'Authentication required',
    })
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('forwards auth, agent proposal headers, JSON body, and timeout to Titan', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
      cookieSource: 'both',
    })
    mocks.fetchWithTimeout.mockResolvedValue(
      titanJsonResponse(201, {
        token: 'share-token-1',
      })
    )

    const response = await proxyAgentJsonToTitan(
      request({
        'X-Upswitch-Agent-Tool-Name': ' propose_share_token ',
        'X-Upswitch-Agent-Proposal-Id': ' proposal-123 ',
      }),
      '/api/v2/listings/listing-1/share-tokens',
      {
        method: 'POST',
        body: { expires_in_days: 14 },
        timeoutMs: 10_000,
        successStatus: 201,
      }
    )

    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/listings/listing-1/share-tokens',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
          Authorization: 'Bearer jwt-token',
          'X-Upswitch-Agent-Tool-Name': 'propose_share_token',
          'X-Upswitch-Agent-Proposal-Id': 'proposal-123',
        },
        credentials: 'include',
        body: JSON.stringify({ expires_in_days: 14 }),
      },
      10_000
    )
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      success: true,
      data: {
        token: 'share-token-1',
      },
    })
  })

  it('forwards PUT agent approvals with the JSON body intact', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token',
      cookieSource: 'header',
    })
    mocks.fetchWithTimeout.mockResolvedValue(
      titanJsonResponse(200, {
        value: 'dcf',
      })
    )

    const response = await proxyAgentJsonToTitan(
      request({
        'X-Upswitch-Agent-Tool-Name': 'propose_valuation_method_preference',
        'X-Upswitch-Agent-Proposal-Id': 'preference-123',
      }),
      '/api/v2/accountants/clients/client-1/valuation-method-preference',
      {
        method: 'PUT',
        body: { value: 'dcf' },
      }
    )

    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/accountants/clients/client-1/valuation-method-preference',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'upswitch_access_token=jwt-token',
          Authorization: 'Bearer jwt-token',
          'X-Upswitch-Agent-Tool-Name': 'propose_valuation_method_preference',
          'X-Upswitch-Agent-Proposal-Id': 'preference-123',
        },
        credentials: 'include',
        body: JSON.stringify({ value: 'dcf' }),
      },
      15_000
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: {
        value: 'dcf',
      },
    })
  })

  it('passes through a Titan 204 response without forcing a JSON envelope', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token',
      cookieSource: 'header',
    })
    mocks.fetchWithTimeout.mockResolvedValue(new Response(null, { status: 204 }))

    const response = await proxyAgentJsonToTitan(
      request(),
      '/api/v2/listings/listing-1/share-tokens/token-1',
      {
        method: 'DELETE',
      }
    )

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })

  it('returns Titan error details using the upstream message when present', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token',
      cookieSource: 'header',
    })
    mocks.fetchWithTimeout.mockResolvedValue(
      titanJsonResponse(409, {
        message: 'Share token already exists',
        code: 'token_conflict',
      })
    )

    const response = await proxyAgentJsonToTitan(
      request(),
      '/api/v2/listings/listing-1/share-tokens',
      {
        method: 'POST',
      }
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      success: false,
      message: 'Share token already exists',
      data: {
        message: 'Share token already exists',
        code: 'token_conflict',
      },
    })
  })
})
