import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  proxyAgentJsonToTitan: vi.fn(),
}))

vi.mock('../../../../_utils/agentActionProxy', () => ({
  encodeTitanPathSegment: (value: string) => encodeURIComponent(value),
  proxyAgentJsonToTitan: mocks.proxyAgentJsonToTitan,
}))

import { POST } from './route'

function request(body: unknown) {
  return new NextRequest(
    'https://valuation.upswitch.app/api/integrations/accounting/resync-client/client-1',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
}

beforeEach(() => {
  mocks.proxyAgentJsonToTitan.mockReset()
  mocks.proxyAgentJsonToTitan.mockResolvedValue(Response.json({ success: true }))
})

describe('accounting resync-client route', () => {
  it('proxies client-scoped sync requests to Titan with force=true only when explicit', async () => {
    const req = request({ force: true, ignored: 'not forwarded' })

    await POST(req, { params: Promise.resolve({ clientId: 'client 1' }) })

    expect(mocks.proxyAgentJsonToTitan).toHaveBeenCalledWith(
      req,
      '/integrations/accounting/resync-client/client%201',
      {
        method: 'POST',
        body: { force: true },
        timeoutMs: 30_000,
      }
    )
  })

  it('does not forward non-boolean force values', async () => {
    const req = request({ force: 'yes' })

    await POST(req, { params: Promise.resolve({ clientId: 'client-1' }) })

    expect(mocks.proxyAgentJsonToTitan).toHaveBeenCalledWith(
      req,
      '/integrations/accounting/resync-client/client-1',
      expect.objectContaining({
        body: {},
      })
    )
  })

  it('rejects missing client ids before Titan sees the request', async () => {
    const response = await POST(request({ force: true }), {
      params: Promise.resolve({ clientId: '' }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      message: 'Client ID is required',
    })
    expect(mocks.proxyAgentJsonToTitan).not.toHaveBeenCalled()
  })
})
