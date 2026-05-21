// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { resolveReturnedConversationIdUpdate } from './manualChatConversationId'

describe('resolveReturnedConversationIdUpdate', () => {
  it('stores a returned id when the client had none yet', () => {
    expect(resolveReturnedConversationIdUpdate(null, 'conv-1')).toBe('conv-1')
  })

  it('stores a different returned id so Titan can repair a stale client id', () => {
    expect(resolveReturnedConversationIdUpdate('stale-conv', 'repaired-conv')).toBe('repaired-conv')
  })

  it('does not rewrite state when the returned id matches the current id', () => {
    expect(resolveReturnedConversationIdUpdate('conv-1', 'conv-1')).toBeNull()
  })

  it('ignores blank returned ids', () => {
    expect(resolveReturnedConversationIdUpdate('conv-1', '   ')).toBeNull()
    expect(resolveReturnedConversationIdUpdate('conv-1', undefined)).toBeNull()
  })
})
