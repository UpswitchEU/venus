import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/getTitanApiUrl', () => ({
  getTitanApiUrl: () => 'http://titan.test',
}))

import { POST } from './route'

function makeRequest(body: unknown, init?: { signal?: AbortSignal }): NextRequest {
  return new NextRequest('http://venus.test/api/registry/search', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    signal: init?.signal,
  })
}

describe('POST /api/registry/search', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, results: [] }),
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns 499 when the inbound request is already aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    const res = await POST(
      makeRequest({ company_name: 'Acme NV', country_code: 'BE' }, { signal: ac.signal })
    )
    expect(res.status).toBe(499)
    const json = (await res.json()) as { success: boolean; results: unknown[]; error?: string }
    expect(json.success).toBe(false)
    expect(json.error).toMatch(/cancelled/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('POSTs to Titan /api/v2/registry/search with JSON body', async () => {
    const res = await POST(makeRequest({ company_name: 'Acme', country_code: 'BE', limit: 5 }))
    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledWith(
      'http://titan.test/api/v2/registry/search',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Acme'),
      })
    )
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(JSON.parse(init.body as string)).toEqual({
      company_name: 'Acme',
      country_code: 'BE',
      limit: 5,
    })
  })

  it('falls back to v1 when v2 returns 404', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, results: [{ company_id: '1' }] }),
      })

    const res = await POST(makeRequest({ company_name: 'Beta' }))
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://titan.test/api/v2/registry/search')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://titan.test/api/v1/registry/search')
  })
})
