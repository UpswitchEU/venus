import type { ChatMessage } from '@/components/calculator'

export {
  addIdsToManualChatToolCards,
  appendManualChatToolCardsToMessages,
  applyManualChatSellabilityComputedScore,
  markManualChatProposalDecision,
  parseManualChatStreamToolResult,
} from './manualChatToolCards'

export function idFactory() {
  let next = 0
  return () => `id-${++next}`
}

export function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: '',
    timestamp: new Date('2026-05-15T10:00:00.000Z'),
    ...overrides,
  }
}
