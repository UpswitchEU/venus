import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchJsonWithTimeout: vi.fn(),
}))

vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchJsonWithTimeout: mocks.fetchJsonWithTimeout,
}))

import { GET } from './route'

function jsonResponse(status: number): Response {
  return new Response(null, { status })
}

beforeEach(() => {
  mocks.fetchJsonWithTimeout.mockReset()
})

describe('/api/reference/grootboek', () => {
  it('returns Titan reference data through a body-bounded fetch', async () => {
    mocks.fetchJsonWithTimeout.mockResolvedValueOnce({
      response: jsonResponse(200),
      json: { success: true, data: [{ code: '700000' }] },
    })

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: [{ code: '700000' }] })
    expect(mocks.fetchJsonWithTimeout).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/reference-data/grootboek'),
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        next: { revalidate: 3600 },
      },
      10_000
    )
  })

  it('maps upstream timeouts to 504', async () => {
    mocks.fetchJsonWithTimeout.mockRejectedValueOnce(
      new Error('Request timeout - please try again')
    )

    const response = await GET()

    expect(response.status).toBe(504)
    expect(await response.json()).toEqual({ success: false, error: 'Request timeout' })
  })
})
