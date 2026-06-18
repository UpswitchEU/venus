import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/getTitanApiUrl', () => ({
  getTitanApiUrl: () => 'https://api.upswitch.app',
}))

import { POST } from './route'

function makeRequest(body: unknown, init?: { signal?: AbortSignal }): NextRequest {
  return new NextRequest('https://valuation.upswitch.app/api/registry/search', {
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
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, results: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
  })

  afterEach(() => {
    vi.useRealTimers()
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
      'https://api.upswitch.app/api/v2/registry/search',
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

  it('passes Titan multi business-type enrichment through unchanged', async () => {
    const enrichedResponse = {
      success: true,
      results: [
        {
          company_id: '0631747439',
          company_name: 'Boekhoudkantoor Venus',
          registration_number: '0631747439',
          country_code: 'BE',
          nace_code: '69.201',
          nace_codes: ['69.201', '70.220'],
          business_type_id: 'accounting_firm',
          business_type_title: 'Accounting firm',
          business_type_candidates: [
            {
              nace_code: '69.201',
              business_type_id: 'accounting_firm',
              business_type_title: 'Accounting firm',
              is_primary: true,
            },
            {
              nace_code: '70.220',
              business_type_id: 'business_consulting',
              business_type_title: 'Business consulting',
              is_primary: false,
            },
          ],
          default_business_type_id: 'accounting_firm',
          requires_segment_confirmation: true,
        },
      ],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(enrichedResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )

    const res = await POST(makeRequest({ company_name: 'Boekhoudkantoor Venus' }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(enrichedResponse)
  })

  it('falls back to v1 when v2 returns 404', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 404, statusText: 'Not Found' }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, results: [{ company_id: '1' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

    const res = await POST(makeRequest({ company_name: 'Beta' }))
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.upswitch.app/api/v2/registry/search')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.upswitch.app/api/v1/registry/search')
  })

  it('returns 504 when Titan stalls while reading the response body', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal ?? null
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          text: () =>
            new Promise<string>((_resolve, reject) => {
              signal?.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'))
              })
            }),
        } as unknown as Response)
      })
    )

    const responsePromise = POST(makeRequest({ company_name: 'Acme' }))
    await Promise.resolve()
    await Promise.resolve()

    const assertion = expect(responsePromise.then((response) => response.status)).resolves.toBe(504)
    await vi.advanceTimersByTimeAsync(14_501)

    await assertion
  })
})
