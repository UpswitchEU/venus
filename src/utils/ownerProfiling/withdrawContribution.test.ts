import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __testing__,
  withdrawAnonymizedContribution,
} from './withdrawContribution'

const { isUuid } = __testing__

const VALID_UUID = '11111111-2222-3333-4444-555555555555'

describe('isUuid', () => {
  it('accepts canonical UUIDs (lower + upper case hex)', () => {
    expect(isUuid(VALID_UUID)).toBe(true)
    expect(isUuid('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE')).toBe(true)
  })

  it('rejects non-UUID partner reference shapes', () => {
    // Mirrors apps/titan-api/src/utils/identifiers.util.ts:isUuid contract
    // — the Titan endpoint rejects non-UUIDs, so Venus must fail-fast.
    expect(isUuid('val_1769197369597_vwfre4ljar')).toBe(false)
    expect(isUuid('deal-2026-04')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid('11111111-2222-3333-4444-55555555555')).toBe(false) // 1 char short
    expect(isUuid('11111111-2222-3333-4444-5555555555555')).toBe(false) // 1 char long
  })
})

describe('withdrawAnonymizedContribution', () => {
  const fetchSpy = vi.fn<typeof fetch>()
  const originalFetch = globalThis.fetch
  const originalEnv = process.env.NEXT_PUBLIC_TITAN_API_URL

  beforeEach(() => {
    fetchSpy.mockReset()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    process.env.NEXT_PUBLIC_TITAN_API_URL = 'https://titan.example'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    process.env.NEXT_PUBLIC_TITAN_API_URL = originalEnv
  })

  function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  }

  it('throws when Titan URL is not configured', async () => {
    process.env.NEXT_PUBLIC_TITAN_API_URL = ''
    await expect(
      withdrawAnonymizedContribution({ valuationId: VALID_UUID }),
    ).rejects.toThrow(/Titan API URL/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects non-UUID valuationId without round-tripping', async () => {
    await expect(
      withdrawAnonymizedContribution({ valuationId: 'val_legacy' }),
    ).rejects.toThrow(/UUID/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns withdrawn status on first successful call', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        status: 'withdrawn',
        rows_affected: 1,
        contributor_reference: VALID_UUID,
      }),
    )
    const result = await withdrawAnonymizedContribution({
      valuationId: VALID_UUID,
      reason: 'changed my mind',
    })
    expect(result).toEqual({
      status: 'withdrawn',
      rowsAffected: 1,
      contributorReference: VALID_UUID,
    })

    // Confirm the request was shaped per the Titan contract.
    const [, init] = fetchSpy.mock.calls[0]
    const body = JSON.parse((init?.body as string) ?? '{}')
    expect(body.contributor_reference).toBe(VALID_UUID)
    expect(body.reason).toBe('changed my mind')
  })

  it('returns already_withdrawn on idempotent retry', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        status: 'already_withdrawn',
        rows_affected: 0,
        contributor_reference: VALID_UUID,
      }),
    )
    const result = await withdrawAnonymizedContribution({ valuationId: VALID_UUID })
    expect(result.status).toBe('already_withdrawn')
    expect(result.rowsAffected).toBe(0)
  })

  it('returns not_found when the reference does not exist', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        status: 'not_found',
        rows_affected: 0,
        contributor_reference: VALID_UUID,
      }),
    )
    const result = await withdrawAnonymizedContribution({ valuationId: VALID_UUID })
    expect(result.status).toBe('not_found')
  })

  it('throws an auth-flavored error on 401', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, { status: 401 }))
    await expect(
      withdrawAnonymizedContribution({ valuationId: VALID_UUID }),
    ).rejects.toThrow(/Authentication/)
  })

  it('throws an auth-flavored error on 403', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: 'Forbidden' }, { status: 403 }))
    await expect(
      withdrawAnonymizedContribution({ valuationId: VALID_UUID }),
    ).rejects.toThrow(/Authentication/)
  })

  it('throws on non-OK responses with status detail', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ error: 'Service Unavailable' }, { status: 503 }),
    )
    await expect(
      withdrawAnonymizedContribution({ valuationId: VALID_UUID }),
    ).rejects.toThrow(/Withdraw failed \(503\)/)
  })

  it('throws on unexpected status token', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        status: 'something_new',
        rows_affected: 0,
        contributor_reference: VALID_UUID,
      }),
    )
    await expect(
      withdrawAnonymizedContribution({ valuationId: VALID_UUID }),
    ).rejects.toThrow(/unexpected status/)
  })

  it('truncates an overlong reason before sending', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        status: 'withdrawn',
        rows_affected: 1,
        contributor_reference: VALID_UUID,
      }),
    )
    await withdrawAnonymizedContribution({
      valuationId: VALID_UUID,
      reason: 'x'.repeat(500),
    })
    const [, init] = fetchSpy.mock.calls[0]
    const body = JSON.parse((init?.body as string) ?? '{}')
    // Titan + Delphi cap at 256; matching here keeps a single boundary
    // story so a server reject never fires for a length issue.
    expect(typeof body.reason).toBe('string')
    expect((body.reason as string).length).toBeLessThanOrEqual(256)
  })

  it('omits reason from payload when blank/whitespace', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        status: 'withdrawn',
        rows_affected: 1,
        contributor_reference: VALID_UUID,
      }),
    )
    await withdrawAnonymizedContribution({
      valuationId: VALID_UUID,
      reason: '   ',
    })
    const [, init] = fetchSpy.mock.calls[0]
    const body = JSON.parse((init?.body as string) ?? '{}')
    expect(body.reason).toBeUndefined()
  })

  it('forwards credentials so the JWT cookie reaches Titan', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        status: 'withdrawn',
        rows_affected: 1,
        contributor_reference: VALID_UUID,
      }),
    )
    await withdrawAnonymizedContribution({ valuationId: VALID_UUID })
    const [, init] = fetchSpy.mock.calls[0]
    expect(init?.credentials).toBe('include')
    expect(init?.method).toBe('POST')
  })
})
