import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  proxyAgentJsonToTitan: vi.fn(),
}))

vi.mock('../../../_utils/agentActionProxy', () => ({
  encodeTitanPathSegment: (value: string) => encodeURIComponent(value),
  proxyAgentJsonToTitan: mocks.proxyAgentJsonToTitan,
}))

import { POST } from './route'

function request(body: unknown) {
  return new NextRequest('https://valuation.upswitch.app/api/listings/listing-1/share-tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  mocks.proxyAgentJsonToTitan.mockReset()
  mocks.proxyAgentJsonToTitan.mockResolvedValue(Response.json({ success: true }, { status: 201 }))
})

describe('listing share-token route', () => {
  it('normalizes and bounds the conversational mint payload before proxying', async () => {
    const req = request({
      expires_in_days: 14,
      max_uses: 2,
      label: '  For Acme Capital  ',
      ignored: 'not forwarded',
    })

    await POST(req, { params: Promise.resolve({ id: 'listing 1' }) })

    expect(mocks.proxyAgentJsonToTitan).toHaveBeenCalledWith(
      req,
      '/api/v2/listings/listing%201/share-tokens',
      {
        method: 'POST',
        body: {
          expiresInDays: 14,
          maxUses: 2,
          label: 'For Acme Capital',
        },
        timeoutMs: 10_000,
        successStatus: 201,
      }
    )
  })

  it('rejects share-token values outside the chat card bounds', async () => {
    const response = await POST(request({ expiresInDays: 365, maxUses: 2 }), {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      message: 'expiresInDays must be an integer between 1 and 90',
    })
    expect(mocks.proxyAgentJsonToTitan).not.toHaveBeenCalled()
  })

  it('rejects overlong labels before Titan sees them', async () => {
    const response = await POST(request({ expiresInDays: 14, label: 'a'.repeat(81) }), {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      message: 'label must be 80 characters or fewer',
    })
    expect(mocks.proxyAgentJsonToTitan).not.toHaveBeenCalled()
  })
})
