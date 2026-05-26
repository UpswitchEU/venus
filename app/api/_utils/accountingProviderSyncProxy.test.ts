import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  getBffCookieHeaderForTitan: vi.fn(),
  getTitanApiUrl: vi.fn(() => 'https://api.upswitch.app'),
}))

vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
}))

vi.mock('@/utils/bffAuthProxy', () => ({
  getBffCookieHeaderForTitan: mocks.getBffCookieHeaderForTitan,
}))

vi.mock('@/utils/getTitanApiUrl', () => ({
  getTitanApiUrl: mocks.getTitanApiUrl,
}))

import { proxyProviderAccountingSyncToTitan } from './accountingProviderSyncProxy'

function request(body: unknown = {}, headers: Record<string, string> = {}) {
  return new NextRequest(
    'https://valuation.upswitch.app/api/integrations/accounting/sync-provider/exact',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    }
  )
}

function jsonResponse(status: number, body: unknown): Response {
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

describe('provider accounting sync proxy', () => {
  it('rejects unsupported providers before calling Titan', async () => {
    const response = await proxyProviderAccountingSyncToTitan(request(), 'quickbooks')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      message: 'Unsupported provider: quickbooks',
    })
    expect(mocks.getBffCookieHeaderForTitan).not.toHaveBeenCalled()
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('requires an access cookie before listing administrations', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_refresh_token=refresh-only',
      cookieSource: 'header',
    })

    const response = await proxyProviderAccountingSyncToTitan(request(), 'exact')

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      success: false,
      message: 'Authentication required',
    })
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('lists administrations and enqueues a provider sync with auth, idempotency, and agent headers', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
      cookieSource: 'both',
    })
    mocks.fetchWithTimeout
      .mockResolvedValueOnce(
        jsonResponse(200, {
          administrations: [
            { administration_id: 'adm-1', name: 'Acme' },
            { administration_id: 'adm-2', name: 'Beta' },
            { administration_id: 'adm-1', name: 'Duplicate' },
          ],
        })
      )
      .mockResolvedValueOnce(jsonResponse(202, { job_id: 'job-1' }))

    const response = await proxyProviderAccountingSyncToTitan(
      request(
        { chain_to_bulk: true },
        {
          'X-Upswitch-Agent-Tool-Name': ' propose_integration_sync ',
          'X-Upswitch-Agent-Proposal-Id': ' proposal-1 ',
        }
      ),
      'exact'
    )

    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(2)
    expect(mocks.fetchWithTimeout.mock.calls[0]).toEqual([
      'https://api.upswitch.app/integrations/accounting/exact/administrations',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
          Authorization: 'Bearer jwt-token',
        },
        credentials: 'include',
      },
      15_000,
    ])
    expect(mocks.fetchWithTimeout.mock.calls[1]).toEqual([
      'https://api.upswitch.app/integrations/accounting/exact/sync-async',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
          Authorization: 'Bearer jwt-token',
          'X-Idempotency-Key': expect.stringMatching(
            /^proxy:accounting\/exact\/sync-provider:[a-f0-9]{24}$/
          ),
          'X-Upswitch-Agent-Tool-Name': 'propose_integration_sync',
          'X-Upswitch-Agent-Proposal-Id': 'proposal-1',
        },
        credentials: 'include',
        body: JSON.stringify({
          administration_ids: ['adm-1', 'adm-2'],
          chain_to_bulk: true,
        }),
      },
      15_000,
    ])
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({
      success: true,
      provider: 'exact',
      administration_count: 2,
      data: { job_id: 'job-1' },
    })
  })

  it('routes Xero through sync-all with xero_ids', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token',
      cookieSource: 'header',
    })
    mocks.fetchWithTimeout
      .mockResolvedValueOnce(
        jsonResponse(200, {
          administrations: [{ administration_id: 'tenant-1', name: 'Tenant' }],
        })
      )
      .mockResolvedValueOnce(jsonResponse(202, { job_id: 'job-xero', job_ids: ['job-xero'] }))

    await proxyProviderAccountingSyncToTitan(request(), 'xero')

    expect(mocks.fetchWithTimeout.mock.calls[1]?.[0]).toBe(
      'https://api.upswitch.app/integrations/accounting/sync-all'
    )
    expect((mocks.fetchWithTimeout.mock.calls[1]?.[1] as RequestInit).body).toBe(
      JSON.stringify({
        xero_ids: ['tenant-1'],
        chain_to_bulk: false,
      })
    )
  })

  it('returns a user-facing error when the provider has no linked administrations', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token',
      cookieSource: 'header',
    })
    mocks.fetchWithTimeout.mockResolvedValueOnce(jsonResponse(200, { administrations: [] }))

    const response = await proxyProviderAccountingSyncToTitan(request(), 'silverfin')

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      success: false,
      message: 'No linked administrations found for this provider.',
    })
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(1)
  })
})
