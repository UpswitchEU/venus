import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  proxyAgentJsonToTitan: vi.fn(),
}))

vi.mock('../../../../_utils/agentActionProxy', () => ({
  encodeTitanPathSegment: (value: string) => encodeURIComponent(value),
  proxyAgentJsonToTitan: mocks.proxyAgentJsonToTitan,
}))

import { PUT } from './route'

function request(body: unknown) {
  return new NextRequest(
    'https://valuation.upswitch.app/api/accountants/clients/client-1/valuation-method-preference',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
}

beforeEach(() => {
  mocks.proxyAgentJsonToTitan.mockReset()
  mocks.proxyAgentJsonToTitan.mockResolvedValue(Response.json({ success: true }))
})

describe('valuation-method-preference route', () => {
  it('proxies explicit method preferences to Titan', async () => {
    const req = request({ value: 'dcf', ignored: 'not forwarded' })

    await PUT(req, { params: Promise.resolve({ clientId: 'client 1' }) })

    expect(mocks.proxyAgentJsonToTitan).toHaveBeenCalledWith(
      req,
      '/api/v2/accountants/clients/client%201/valuation-method-preference',
      {
        method: 'PUT',
        body: { value: 'dcf' },
        timeoutMs: 20_000,
      }
    )
  })

  it('proxies explicit null as a clear-override request', async () => {
    const req = request({ value: null })

    await PUT(req, { params: Promise.resolve({ clientId: 'client-1' }) })

    expect(mocks.proxyAgentJsonToTitan).toHaveBeenCalledWith(
      req,
      '/api/v2/accountants/clients/client-1/valuation-method-preference',
      expect.objectContaining({
        body: { value: null },
      })
    )
  })

  it('rejects missing value instead of accidentally clearing the override', async () => {
    const response = await PUT(request({}), { params: Promise.resolve({ clientId: 'client-1' }) })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      message: 'Value is required; use null to clear the override',
    })
    expect(mocks.proxyAgentJsonToTitan).not.toHaveBeenCalled()
  })

  it('rejects non-string non-null values', async () => {
    const response = await PUT(request({ value: 123 }), {
      params: Promise.resolve({ clientId: 'client-1' }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      message: 'Value must be a valuation method key or null',
    })
    expect(mocks.proxyAgentJsonToTitan).not.toHaveBeenCalled()
  })
})
