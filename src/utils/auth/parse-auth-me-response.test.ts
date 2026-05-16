import { describe, expect, it } from 'vitest'
import { extractAuthMeUserPayload } from './parse-auth-me-response'

describe('extractAuthMeUserPayload', () => {
  it('accepts nested { data: { user } } auth envelopes', () => {
    expect(
      extractAuthMeUserPayload({
        success: true,
        data: { user: { id: 'u1', email: 'owner@example.com' } },
      })
    ).toEqual({ id: 'u1', email: 'owner@example.com' })
  })

  it('accepts flat { data } auth envelopes', () => {
    expect(
      extractAuthMeUserPayload({
        success: true,
        data: { id: 'u2', plan_type: 'pro' },
      })
    ).toEqual({ id: 'u2', plan_type: 'pro' })
  })

  it('accepts root auth payloads and numeric ids', () => {
    expect(extractAuthMeUserPayload({ id: 42, role: 'seller' })).toEqual({
      id: '42',
      role: 'seller',
    })
  })

  it('rejects malformed successful responses', () => {
    expect(extractAuthMeUserPayload({ success: true, data: {} })).toBeNull()
    expect(extractAuthMeUserPayload(null)).toBeNull()
  })
})
