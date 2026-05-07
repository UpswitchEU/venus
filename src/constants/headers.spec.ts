import { describe, expect, it } from 'vitest'
import {
  CLIENT_CONTEXT_HEADERS,
  extractClientContextFromHeaders,
  LEGACY_CLIENT_CONTEXT_HEADERS,
} from './headers'

function makeGetter(map: Record<string, string>) {
  return (name: string) => map[name.toLowerCase()] ?? null
}

describe('extractClientContextFromHeaders', () => {
  it('returns null when accountant header is missing', () => {
    expect(
      extractClientContextFromHeaders(
        makeGetter({
          [CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID.toLowerCase()]: 'c1',
          [CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID.toLowerCase()]: 'r1',
        })
      )
    ).toBeNull()
  })

  it('returns null when both relationship and client user are missing', () => {
    expect(
      extractClientContextFromHeaders(
        makeGetter({
          [CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID.toLowerCase()]: 'a1',
        })
      )
    ).toBeNull()
  })

  it('parses pending-invite context (accountant + relationship, no client id)', () => {
    expect(
      extractClientContextFromHeaders(
        makeGetter({
          [CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID.toLowerCase()]: 'acct-1',
          [CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID.toLowerCase()]: 'rel-1',
        })
      )
    ).toEqual({
      clientUserId: null,
      accountantUserId: 'acct-1',
      relationshipId: 'rel-1',
    })
  })

  it('parses full delegated context', () => {
    expect(
      extractClientContextFromHeaders(
        makeGetter({
          [CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID.toLowerCase()]: 'user-9',
          [CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID.toLowerCase()]: 'acct-1',
          [CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID.toLowerCase()]: 'rel-1',
        })
      )
    ).toEqual({
      clientUserId: 'user-9',
      accountantUserId: 'acct-1',
      relationshipId: 'rel-1',
    })
  })

  it('accepts legacy header names', () => {
    expect(
      extractClientContextFromHeaders(
        makeGetter({
          [LEGACY_CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID.toLowerCase()]: 'a2',
          [LEGACY_CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID.toLowerCase()]: 'r2',
        })
      )
    ).toEqual({
      clientUserId: null,
      accountantUserId: 'a2',
      relationshipId: 'r2',
    })
  })
})
