// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/components/calculator'
import {
  buildManualAssistantChatMessage,
  buildManualSystemChatMessage,
  buildManualUserChatMessage,
  patchManualChatMessage,
} from './manualChatMessages'

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'message',
    role: 'assistant',
    content: '',
    timestamp: new Date('2026-05-15T10:00:00.000Z'),
    ...overrides,
  }
}

describe('manualChatMessages', () => {
  it('builds assistant chat messages with optional error state', () => {
    expect(
      buildManualAssistantChatMessage({
        id: 'assistant-1',
        content: 'Something failed',
        isError: true,
        timestamp: new Date('2026-05-15T11:00:00.000Z'),
      })
    ).toEqual({
      id: 'assistant-1',
      role: 'assistant',
      content: 'Something failed',
      isError: true,
      timestamp: new Date('2026-05-15T11:00:00.000Z'),
    })
  })

  it('builds system chat messages', () => {
    expect(
      buildManualSystemChatMessage({
        id: 'system-1',
        content: 'Revenue applied',
        timestamp: new Date('2026-05-15T11:00:00.000Z'),
      })
    ).toEqual({
      id: 'system-1',
      role: 'system',
      content: 'Revenue applied',
      timestamp: new Date('2026-05-15T11:00:00.000Z'),
    })
  })

  it('builds user chat messages with attachment object URLs', () => {
    expect(
      buildManualUserChatMessage({
        id: 'user-1',
        content: 'Analyze this',
        timestamp: new Date('2026-05-15T11:00:00.000Z'),
        attachments: [{ name: 'ledger.csv', type: 'text/csv' }],
        createObjectUrl: (attachment) => `blob:${attachment.name}`,
      })
    ).toEqual({
      id: 'user-1',
      role: 'user',
      content: 'Analyze this',
      timestamp: new Date('2026-05-15T11:00:00.000Z'),
      attachments: [{ name: 'ledger.csv', type: 'text/csv', url: 'blob:ledger.csv' }],
    })
  })

  it('patches only the targeted chat message', () => {
    const other = message({ id: 'other', content: 'keep' })
    const target = message({ id: 'target', content: 'old' })

    const result = patchManualChatMessage([other, target], 'target', {
      content: 'new',
      isError: true,
    })

    expect(result).toEqual([other, { ...target, content: 'new', isError: true }])
    expect(result[0]).toBe(other)
    expect(result[1]).not.toBe(target)
  })
})
