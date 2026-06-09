import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getBffCookieHeaderForTitan: vi.fn(),
  getTitanApiUrl: vi.fn(() => 'https://api.upswitch.app'),
  fetchJsonWithTimeout: vi.fn(),
}))

vi.mock('@/utils/bffAuthProxy', () => ({
  getBffCookieHeaderForTitan: mocks.getBffCookieHeaderForTitan,
}))

vi.mock('@/utils/getTitanApiUrl', () => ({
  getTitanApiUrl: mocks.getTitanApiUrl,
}))

vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchJsonWithTimeout: mocks.fetchJsonWithTimeout,
}))

import { POST } from './route'

describe('/api/attestations', () => {
  beforeEach(() => {
    mocks.fetchJsonWithTimeout.mockReset()
    mocks.getBffCookieHeaderForTitan.mockReset()
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({ cookieHeader: 'session=1' })
  })

  it('rejects requests without report_id', async () => {
    const request = new NextRequest('https://valuation.upswitch.app/api/attestations', {
      method: 'POST',
      body: JSON.stringify({}),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toMatchObject({ success: false, message: 'report_id is required' })
    expect(mocks.fetchJsonWithTimeout).not.toHaveBeenCalled()
  })

  it('proxies attestation creation to Titan with session cookies', async () => {
    mocks.fetchJsonWithTimeout.mockResolvedValue({
      response: new Response(JSON.stringify({ id: 'attest-1', status: 'pending' }), {
        status: 201,
      }),
      json: { id: 'attest-1', status: 'pending' },
    })

    const request = new NextRequest('https://valuation.upswitch.app/api/attestations', {
      method: 'POST',
      body: JSON.stringify({ report_id: 'report-1' }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      success: true,
      data: { id: 'attest-1', status: 'pending' },
    })
    expect(mocks.fetchJsonWithTimeout).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/attestations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Cookie: 'session=1',
        }),
      }),
      55_000
    )
  })

  it('forwards Titan error messages when creation fails', async () => {
    mocks.fetchJsonWithTimeout.mockResolvedValue({
      response: new Response(
        JSON.stringify({
          message:
            'Report VAL-1 is not finalized (status=draft); only completed reports can be attested',
        }),
        { status: 400 }
      ),
      json: {
        message:
          'Report VAL-1 is not finalized (status=draft); only completed reports can be attested',
      },
    })

    const request = new NextRequest('https://valuation.upswitch.app/api/attestations', {
      method: 'POST',
      body: JSON.stringify({ report_id: 'report-1' }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.message).toContain('not finalized')
  })
})
