// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { type ManualSellabilityFetch, runManualSellabilityScore } from './manualSellabilityScore'

function makeFetch(response: {
  ok: boolean
  status: number
  body: unknown
}): ManualSellabilityFetch {
  return async () => ({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
  })
}

describe('manualSellabilityScore', () => {
  it('posts to the sellability endpoint and returns parsed score data', async () => {
    await expect(
      runManualSellabilityScore(async (input, init) => {
        expect(input).toBe('/api/sellability/score')
        expect(init).toMatchObject({
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
        return {
          ok: true,
          status: 200,
          json: async () => ({ score: 72, band: 'high', confidence: 'medium' }),
        }
      })
    ).resolves.toEqual({
      kind: 'scored',
      score: 72,
      band: 'high',
      confidence: 'medium',
    })
  })

  it('returns computed when Titan succeeds without parseable score data', async () => {
    await expect(
      runManualSellabilityScore(makeFetch({ ok: true, status: 200, body: { success: true } }))
    ).resolves.toEqual({ kind: 'computed' })
  })

  it('throws extracted errors for failed responses', async () => {
    await expect(
      runManualSellabilityScore(
        makeFetch({
          ok: false,
          status: 422,
          body: { error: 'Owner profile incomplete' },
        })
      )
    ).rejects.toThrow('Owner profile incomplete')
  })

  it('treats success false as a failed response', async () => {
    await expect(
      runManualSellabilityScore(
        makeFetch({
          ok: true,
          status: 200,
          body: { success: false, message: 'No owner profile' },
        })
      )
    ).rejects.toThrow('No owner profile')
  })
})
