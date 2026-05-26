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

function jsonRequest(body: unknown) {
  return new NextRequest('https://valuation.upswitch.app/api/integrations/accounting/yuki/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  mocks.proxyAgentJsonToTitan.mockReset()
  mocks.proxyAgentJsonToTitan.mockResolvedValue(
    Response.json({ success: true, data: { connected: true } })
  )
})

describe('agent secure credential connect route', () => {
  it('rejects providers that are not credential-card providers', async () => {
    const response = await POST(jsonRequest({ api_key: 'secret' }), {
      params: Promise.resolve({ provider: 'exact' }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      message: 'Unsupported credential provider',
    })
    expect(mocks.proxyAgentJsonToTitan).not.toHaveBeenCalled()
  })

  it('normalizes camel-case credential fields before proxying to Titan', async () => {
    const request = jsonRequest({
      apiKey: 'secret',
      administrationId: 'admin-1',
      domainId: 'domain-1',
      apiBaseUrl: 'https://tenant.example',
    })

    await POST(request, { params: Promise.resolve({ provider: 'YUKI' }) })

    expect(mocks.proxyAgentJsonToTitan).toHaveBeenCalledWith(
      request,
      '/integrations/accounting/yuki/connect',
      {
        method: 'POST',
        body: {
          api_key: 'secret',
          administration_id: 'admin-1',
          domain_id: 'domain-1',
          api_base_url: 'https://tenant.example',
        },
        timeoutMs: 30_000,
      }
    )
  })
})
