// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/components/calculator'
import {
  addIdsToManualChatToolCards,
  appendManualChatToolCardsToMessages,
  applyManualChatSellabilityComputedScore,
  markManualChatProposalDecision,
  parseManualChatStreamToolResult,
} from './manualChatToolCards'

function idFactory() {
  let next = 0
  return () => `id-${++next}`
}

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: '',
    timestamp: new Date('2026-05-15T10:00:00.000Z'),
    ...overrides,
  }
}

describe('manualChatToolCards', () => {
  it('parses streaming field updates through the shared AI tool parser', () => {
    const cards = parseManualChatStreamToolResult(
      'update_field_value',
      {
        update: {
          field: 'revenue',
          value: 1_000_000,
          label: 'Revenue',
          confidence: 'high',
        },
      },
      idFactory()
    )

    expect(cards?.fieldUpdates).toEqual([
      {
        field: 'revenue',
        value: 1_000_000,
        label: 'Revenue',
        source: 'ai',
        confidence: 'high',
      },
    ])
  })

  it('parses streaming proposal-card tool results and assigns ids', () => {
    const createId = idFactory()

    expect(
      parseManualChatStreamToolResult(
        'suggest_normalization',
        {
          suggestion: {
            code: '620',
            description: 'Owner salary',
            category: 'salary',
            amount: 50_000,
            reason: 'Market add-back',
          },
        },
        createId
      )?.normalisationSuggestions?.[0]
    ).toMatchObject({ id: 'id-1', status: 'pending', multiple: 5.2 })

    expect(
      parseManualChatStreamToolResult(
        'run_valuation',
        {
          status: 'pending_approval',
          request: {
            report_id: 'report-1',
            methods: ['dcf'],
            estimated_credits: 1,
            inputs_summary: { business_name: 'Acme' },
          },
          message: 'Ready?',
        },
        createId
      )?.valuationRunRequests?.[0]
    ).toMatchObject({
      id: 'id-2',
      status: 'pending_approval',
      reportId: 'report-1',
      methods: ['dcf'],
      estimatedCredits: 1,
      message: 'Ready?',
    })

    expect(
      parseManualChatStreamToolResult(
        'generate_report',
        { status: 'blocked', reason: 'missing_result', message: 'Calculate first' },
        createId
      )?.reportGenerationRequests?.[0]
    ).toMatchObject({
      id: 'id-3',
      status: 'blocked',
      reason: 'missing_result',
      message: 'Calculate first',
    })

    expect(
      parseManualChatStreamToolResult(
        'run_sellability',
        {
          status: 'pending_approval',
          request: { estimated_credits: 0, current_score: null },
        },
        createId
      )?.sellabilityRunRequests?.[0]
    ).toMatchObject({
      id: 'id-4',
      status: 'pending_approval',
      estimatedCredits: 0,
      currentScore: null,
    })
  })

  it('returns null for non-renderable stream tool results', () => {
    expect(parseManualChatStreamToolResult('unknown_tool', {}, idFactory())).toBeNull()
    expect(parseManualChatStreamToolResult('update_field_value', {}, idFactory())).toBeNull()
    expect(parseManualChatStreamToolResult('run_valuation', undefined, idFactory())).toBeNull()
  })

  it('adds ids to non-streaming response cards', () => {
    const cards = addIdsToManualChatToolCards(
      {
        normalisationSuggestions: [{ category: 'rent' }],
        valuationRunRequests: [{ status: 'blocked', reason: 'missing' }],
      },
      idFactory()
    )

    expect(cards.normalisationSuggestions?.[0]).toMatchObject({
      id: 'id-1',
      status: 'pending',
      multiple: 5.2,
      category: 'rent',
    })
    expect(cards.valuationRunRequests?.[0]).toMatchObject({ id: 'id-2', reason: 'missing' })
  })

  it('appends cards to the target assistant message only', () => {
    const messages = [
      assistantMessage({ id: 'other', content: 'leave me' }),
      assistantMessage({ fieldUpdates: [{ field: 'ebitda', value: 1, label: 'EBITDA' }] }),
    ]

    const next = appendManualChatToolCardsToMessages(messages, 'message-1', {
      fieldUpdates: [{ field: 'revenue', value: 2, label: 'Revenue' }],
      reportGenerationRequests: [{ id: 'report-card', status: 'blocked' }],
    })

    expect(next[0]).toBe(messages[0])
    expect(next[1].fieldUpdates).toEqual([
      { field: 'ebitda', value: 1, label: 'EBITDA' },
      { field: 'revenue', value: 2, label: 'Revenue' },
    ])
    expect(next[1].reportGenerationRequests).toEqual([{ id: 'report-card', status: 'blocked' }])
  })

  it('marks proposal decisions in a selected card bucket', () => {
    const messages = [
      assistantMessage({
        valuationRunRequests: [
          { id: 'keep', status: 'blocked' },
          { id: 'target', status: 'blocked' },
        ],
      }),
    ]

    expect(
      markManualChatProposalDecision(messages, 'valuationRunRequests', 'target', 'approved')[0]
        .valuationRunRequests
    ).toEqual([
      { id: 'keep', status: 'blocked' },
      { id: 'target', status: 'blocked', decision: 'approved' },
    ])
  })

  it('applies a computed sellability score to the selected proposal card', () => {
    const messages = [
      assistantMessage({
        sellabilityRunRequests: [
          { id: 'keep', status: 'pending_approval' },
          { id: 'target', status: 'pending_approval' },
        ],
      }),
    ]

    expect(
      applyManualChatSellabilityComputedScore(messages, 'target', {
        score: 82,
        band: 'strong',
        confidence: 'high',
      })[0].sellabilityRunRequests
    ).toEqual([
      { id: 'keep', status: 'pending_approval' },
      {
        id: 'target',
        status: 'pending_approval',
        computedScore: { score: 82, band: 'strong', confidence: 'high' },
      },
    ])
  })
})
