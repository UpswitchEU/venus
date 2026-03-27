import { describe, expect, it } from 'vitest'

import {
  decodeSilverfinOAuthState,
  encodeSilverfinOAuthState,
} from '../silverfin-oauth-state'

describe('silverfin-oauth-state', () => {
  it('encodeSilverfinOAuthState round-trips firm id in state', () => {
    const state = encodeSilverfinOAuthState('12345')
    expect(decodeSilverfinOAuthState(state)).toBe('12345')
  })

  it('decodeSilverfinOAuthState accepts legacy firm_id query style (same JSON)', () => {
    const json = JSON.stringify({ firm_id: '999' })
    const state = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(decodeSilverfinOAuthState(state)).toBe('999')
  })

  it('encodeSilverfinOAuthState throws on empty firm id', () => {
    expect(() => encodeSilverfinOAuthState('   ')).toThrow('firm_id is required')
  })

  it('decodeSilverfinOAuthState returns null for invalid input', () => {
    expect(decodeSilverfinOAuthState(null)).toBeNull()
    expect(decodeSilverfinOAuthState('')).toBeNull()
    expect(decodeSilverfinOAuthState('not-valid-base64!!!')).toBeNull()
  })
})
