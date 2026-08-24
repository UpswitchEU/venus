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
vi.mock('@/utils/getTitanApiUrl', () => ({ getTitanApiUrl: mocks.getTitanApiUrl }))
vi.mock('@/utils/fetchWithTimeout', () => ({ fetchJsonWithTimeout: mocks.fetchJsonWithTimeout }))

import { POST } from './route'

describe('POST /api/valuations/[id]/review/approval-candidate', () => {
  beforeEach(() => {
    mocks.fetchJsonWithTimeout.mockReset()
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({ cookieHeader: 'session=1' })
  })

  it('forwards only the nine explicit preflight checks', async () => {
    const candidate = {
      downloadUrl: 'https://storage.test/candidate',
      pdfSha256: 'a'.repeat(64),
      renderSnapshotHash: 'b'.repeat(64),
      receiptSha256: 'c'.repeat(64),
      expiresInSeconds: 300,
    }
    mocks.fetchJsonWithTimeout.mockResolvedValue({
      response: new Response(JSON.stringify(candidate), { status: 200 }),
      json: candidate,
    })
    const checks = {
      scope: true,
      identity: true,
      closed_periods: true,
      normalizations: true,
      business_type: true,
      method: true,
      benchmark: true,
      balance_sheet: true,
      net_debt: true,
      final_pdf: true,
      injected: true,
    }
    const request = new NextRequest(
      'https://valuation.upswitch.app/api/valuations/report-1/review/approval-candidate',
      { method: 'POST', body: JSON.stringify({ reviewChecklist: checks }) }
    )

    const response = await POST(request, { params: Promise.resolve({ id: 'report-1' }) })

    expect(response.status).toBe(200)
    expect(mocks.fetchJsonWithTimeout).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/valuations/report-1/approval-candidate',
      expect.objectContaining({
        body: JSON.stringify({
          reviewChecklist: Object.fromEntries(
            Object.keys(checks)
              .filter((key) => !['final_pdf', 'injected'].includes(key))
              .map((key) => [key, true])
          ),
        }),
      }),
      35_000
    )
  })
})
