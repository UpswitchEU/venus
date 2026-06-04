import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  getBffCookieHeaderForTitan: vi.fn(),
  getMercuryUrl: vi.fn(() => 'https://www.upswitch.app'),
}))

vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
  fetchTextWithTimeout: async (...args: unknown[]) => {
    const response = (await mocks.fetchWithTimeout(...args)) as Response
    return { response, text: await response.text().catch(() => null) }
  },
}))

vi.mock('@/utils/bffAuthProxy', () => ({
  AuthUpstreamTimeoutError: class AuthUpstreamTimeoutError extends Error {},
  getBffCookieHeaderForTitan: mocks.getBffCookieHeaderForTitan,
}))

vi.mock('@/utils/getMercuryUrl', () => ({
  getMercuryUrl: mocks.getMercuryUrl,
}))

import { proxyAgentMultipartToMercury } from './agentMultipartProxy'

function multipartRequest(headers: Record<string, string> = {}) {
  const form = new FormData()
  form.append('file', new Blob(['account,amount\n700000,1000'], { type: 'text/csv' }), 'tb.csv')
  form.append('mode', 'single_client_trial_balance')

  return {
    headers: new Headers(headers),
    formData: vi.fn().mockResolvedValue(form),
  } as unknown as NextRequest
}

beforeEach(() => {
  mocks.fetchWithTimeout.mockReset()
  mocks.getBffCookieHeaderForTitan.mockReset()
  mocks.getMercuryUrl.mockClear()
  mocks.getMercuryUrl.mockReturnValue('https://www.upswitch.app')
})

describe('agent multipart proxy', () => {
  it('returns 401 before forwarding file uploads without an access token', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_refresh_token=refresh-only',
      cookieSource: 'header',
    })

    const response = await proxyAgentMultipartToMercury(
      multipartRequest(),
      '/api/import/trial-balance'
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      success: false,
      message: 'Authentication required',
    })
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('forwards multipart uploads to the matching Mercury manual import route', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
      cookieSource: 'both',
    })
    mocks.fetchWithTimeout.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, ingested: { rows: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const response = await proxyAgentMultipartToMercury(
      multipartRequest({
        'X-Upswitch-Agent-Tool-Name': 'propose_csv_upload',
        'X-Upswitch-Agent-Proposal-Id': 'proposal-123',
      }),
      '/api/import/trial-balance'
    )

    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      'https://www.upswitch.app/api/import/trial-balance',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Cookie: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
          'X-Upswitch-Agent-Tool-Name': 'propose_csv_upload',
          'X-Upswitch-Agent-Proposal-Id': 'proposal-123',
        },
        body: expect.anything(),
      }),
      290_000
    )
    const forwardedBody = mocks.fetchWithTimeout.mock.calls[0]?.[1]?.body as FormData
    expect(typeof forwardedBody.get).toBe('function')
    expect(forwardedBody.get('mode')).toBe('single_client_trial_balance')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, ingested: { rows: 1 } })
  })
})
