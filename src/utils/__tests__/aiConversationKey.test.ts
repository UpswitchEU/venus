import { describe, expect, it } from 'vitest'
import aiConversationKeyContract from '../../../../../tests/contracts/ai-conversation-key-contract.json'
import {
  deriveAdvisorWorkspaceSessionKey,
  deriveClientScopedSessionKey,
} from '../aiConversationKey'

/**
 * Contract pin for cross-app AI conversation key.
 *
 * MUST stay aligned with Mercury's parallel test in
 * `apps/mercury/tests/unit/ai-dock-tool-card-parser.test.ts`
 * (search for `deriveClientScopedSessionKey`). Both tests read the
 * shared root fixture. If the two derivations
 * drift, the Mercury advisor dock and the Venus calculator chat
 * drawer stop sharing a conversation row and the
 * `resolveConversationLookupKey` override in Titan's AI controller
 * silently lands users on different threads.
 */
describe('deriveClientScopedSessionKey (Venus side)', () => {
  it('returns the shared `client_<id>` key for every contract case', () => {
    for (const testCase of aiConversationKeyContract.clientScopedCases) {
      expect(deriveClientScopedSessionKey({ clientUserId: testCase.clientUserId })).toBe(
        testCase.expected
      )
    }
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
    const { clientUserId: id, expected } = aiConversationKeyContract.clientScopedCases[1]
    expect(deriveClientScopedSessionKey({ clientUserId: id })).toBe(expected)
  })
})

describe('deriveAdvisorWorkspaceSessionKey (Venus side)', () => {
  it('returns the shared advisor workspace key for every contract case', () => {
    for (const testCase of aiConversationKeyContract.workspaceCases) {
      expect(
        deriveAdvisorWorkspaceSessionKey(testCase.advisorUserId, testCase.pathname)
      ).toBe(testCase.expected)
    }
  })
})
