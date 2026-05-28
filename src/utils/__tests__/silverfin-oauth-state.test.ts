import { describe, expect, it } from 'vitest'

import {
  decodeSilverfinOAuthState,
  decodeSilverfinOAuthStatePayload,
  encodeSilverfinOAuthState,
} from '../silverfin-oauth-state'

describe('silverfin-oauth-state', () => {
  it('encodeSilverfinOAuthState round-trips firm id in state', () => {
    const state = encodeSilverfinOAuthState('12345')
    expect(decodeSilverfinOAuthState(state)).toBe('12345')
  })

  it('decodeSilverfinOAuthState accepts legacy firm_id-only payload', () => {
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

  // CSRF nonce — added 2026-05-28
  it('encodeSilverfinOAuthState carries the nonce alongside firm_id', () => {
    const state = encodeSilverfinOAuthState('12345', 'abc-nonce-32-bytes')
    const payload = decodeSilverfinOAuthStatePayload(state)
    expect(payload).toEqual({ firm_id: '12345', nonce: 'abc-nonce-32-bytes' })
  })

  it('decodeSilverfinOAuthStatePayload returns nonce=null for legacy state without nonce', () => {
    const state = encodeSilverfinOAuthState('999')
    const payload = decodeSilverfinOAuthStatePayload(state)
    expect(payload).toEqual({ firm_id: '999', nonce: null })
  })

  it('encodeSilverfinOAuthState ignores whitespace-only nonce', () => {
    const state = encodeSilverfinOAuthState('12345', '   ')
    expect(decodeSilverfinOAuthStatePayload(state)).toEqual({
      firm_id: '12345',
      nonce: null,
    })
  })

  it('decodeSilverfinOAuthStatePayload returns null for nonce-only state (no firm_id)', () => {
    const json = JSON.stringify({ nonce: 'abc' })
    const state = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(decodeSilverfinOAuthStatePayload(state)).toBeNull()
  })
})
