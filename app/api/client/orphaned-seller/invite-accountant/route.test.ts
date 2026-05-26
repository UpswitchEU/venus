import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  proxyAgentJsonToTitan: vi.fn(),
}))

vi.mock('../../../_utils/agentActionProxy', () => ({
  proxyAgentJsonToTitan: mocks.proxyAgentJsonToTitan,
}))

import { POST } from './route'

function request(body: unknown) {
  return new NextRequest(
    'https://valuation.upswitch.app/api/client/orphaned-seller/invite-accountant',
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

describe('orphaned-seller invite-accountant route', () => {
  it('normalizes the conversational invite payload before proxying to Titan', async () => {
    const req = request({
      accountant_email: '  Advisor@Example.COM ',
      custom_message: '  Can you review the books?  ',
      surface: 'report',
      report_id: ' report-1 ',
      business_name: '  Acme NV  ',
      ignored: 'not forwarded',
    })

    await POST(req)

    expect(mocks.proxyAgentJsonToTitan).toHaveBeenCalledWith(
      req,
      '/api/v2/client/orphaned-seller/invite-accountant',
      {
        method: 'POST',
        body: {
          accountant_email: 'advisor@example.com',
          custom_message: 'Can you review the books?',
          surface: 'report',
          report_id: 'report-1',
          business_name: 'Acme NV',
        },
        timeoutMs: 60_000,
      }
    )
  })

  it('defaults unknown surfaces to the conversational card surface', async () => {
    const req = request({
      accountant_email: 'advisor@example.com',
      surface: 'side-door',
    })

    await POST(req)

    expect(mocks.proxyAgentJsonToTitan).toHaveBeenCalledWith(
      req,
      '/api/v2/client/orphaned-seller/invite-accountant',
      expect.objectContaining({
        body: {
          accountant_email: 'advisor@example.com',
          surface: 'card',
        },
      })
    )
  })

  it('rejects invalid emails before Titan sees them', async () => {
    const response = await POST(request({ accountant_email: 'not-an-email' }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      message: 'Enter a valid accountant email address',
    })
    expect(mocks.proxyAgentJsonToTitan).not.toHaveBeenCalled()
  })

  it('rejects overlong custom messages before Titan sees them', async () => {
    const response = await POST(
      request({
        accountant_email: 'advisor@example.com',
        custom_message: 'a'.repeat(501),
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      message: 'Custom message must be 500 characters or fewer',
    })
    expect(mocks.proxyAgentJsonToTitan).not.toHaveBeenCalled()
  })
})
