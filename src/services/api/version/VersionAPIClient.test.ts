import { afterEach, describe, expect, it, vi } from 'vitest'
import { VersionAPIClient } from './VersionAPIClient'

describe('VersionAPIClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps Titan version session routes to the same-origin browser proxy', () => {
    const client = new VersionAPIClient({ useProxy: true })

    expect(client.resolveUrl('/api/v2/valuations/sessions/report-1/versions')).toBe(
      '/api/valuations/sessions/report-1/versions'
    )
    expect(client.resolveUrl('/api/valuation-versions/version-1/conversations')).toBe(
      '/api/valuation-versions/version-1/conversations'
    )
  })

  it('prefixes direct server requests with the Titan API origin', () => {
    const client = new VersionAPIClient({
      baseURL: 'https://titan.example',
      useProxy: false,
    })

    expect(client.resolveUrl('/api/v2/valuations/sessions/report-1/versions')).toBe(
      'https://titan.example/api/v2/valuations/sessions/report-1/versions'
    )
  })

  it('removes caller abort listeners after a completed request', async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ success: true }),
      ok: true,
    }))
    vi.stubGlobal('fetch', fetchMock)

    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const signal = {
      aborted: false,
      addEventListener,
      removeEventListener,
    } as unknown as AbortSignal

    const client = new VersionAPIClient({ useProxy: true })

    await expect(
      client.request<{ success: boolean }>(
        {
          method: 'GET',
          url: '/api/v2/valuations/sessions/report-1/versions',
        },
        { signal }
      )
    ).resolves.toEqual({ success: true })

    const abortHandler = addEventListener.mock.calls[0]?.[1]
    expect(addEventListener).toHaveBeenCalledWith('abort', abortHandler, { once: true })
    expect(removeEventListener).toHaveBeenCalledWith('abort', abortHandler)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/valuations/sessions/report-1/versions',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      })
    )
  })

  it('removes caller abort listeners when a request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        statusText: 'Service unavailable',
      }))
    )

    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const signal = {
      aborted: false,
      addEventListener,
      removeEventListener,
    } as unknown as AbortSignal
    const client = new VersionAPIClient({ useProxy: true })

    await expect(
      client.request(
        {
          method: 'GET',
          url: '/api/v2/valuations/sessions/report-1/versions',
        },
        { signal }
      )
    ).rejects.toThrow('API request failed: Service unavailable')

    expect(removeEventListener).toHaveBeenCalledWith('abort', addEventListener.mock.calls[0]?.[1])
  })
})
