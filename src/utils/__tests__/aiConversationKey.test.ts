import { describe, expect, it } from 'vitest'
import { deriveClientScopedSessionKey } from '../aiConversationKey'

/**
 * Contract pin for cross-app AI conversation key.
 *
 * MUST stay byte-for-byte identical to Mercury's parallel test in
 * `apps/mercury/tests/unit/ai-dock-tool-card-parser.test.ts`
 * (search for `deriveClientScopedSessionKey`). If the two derivations
 * drift, the Mercury advisor dock and the Venus calculator chat
 * drawer stop sharing a conversation row and the
 * `resolveConversationLookupKey` override in Titan's AI controller
 * silently lands users on different threads.
 */
describe('deriveClientScopedSessionKey (Venus side)', () => {
  it('returns `client_<id>` for a non-empty clientUserId', () => {
    expect(
      deriveClientScopedSessionKey({ clientUserId: 'abc-123' }),
    ).toBe('client_abc-123')
  })

  it('returns null for missing clientUserId', () => {
    expect(deriveClientScopedSessionKey({ clientUserId: null })).toBeNull()
    expect(deriveClientScopedSessionKey({ clientUserId: undefined })).toBeNull()
    expect(deriveClientScopedSessionKey({ clientUserId: '' })).toBeNull()
  })

  it('matches Mercury parser output for the same id (cross-app pin)', () => {
    // Mercury's helper returns `client_<id>` (or an advisor-scratchpad
    // fallback when clientUserId is absent). For the SHARED path
    // (clientUserId present), both apps MUST produce the identical
    // string — that's what makes the Titan conversation row align.
    const id = '7c1d4b2e-9f3a-4a8e-b5d6-1c2b3a4d5e6f'
    expect(deriveClientScopedSessionKey({ clientUserId: id })).toBe(
      `client_${id}`,
    )
  })
})
