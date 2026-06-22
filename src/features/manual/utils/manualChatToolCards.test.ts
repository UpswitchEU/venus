// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  addIdsToManualChatToolCards,
  idFactory,
  parseManualChatStreamToolResult,
} from './manualChatToolCards.testUtils'

describe('manualChatToolCards core parsing', () => {
  it('adds ids through one registry path while preserving special card defaults', () => {
    const cards = addIdsToManualChatToolCards(
      {
        fieldUpdates: [{ field: 'revenue', value: 1_000_000, label: 'Revenue' }],
        normalisationSuggestions: [{ description: 'Owner salary add-back' }],
        valuationDefaultsPreviews: [{ status: 'ok' }],
        buyerReadyCards: [{ status: 'ready' }],
      },
      idFactory()
    )

    expect(cards.fieldUpdates?.[0]).toEqual({
      field: 'revenue',
      value: 1_000_000,
      label: 'Revenue',
    })
    expect(cards.normalisationSuggestions?.[0]).toMatchObject({
      id: 'id-1',
      status: 'pending',
      multiple: 5.2,
    })
    expect(cards.valuationDefaultsPreviews?.[0]).toMatchObject({ id: 'id-2' })
    expect(cards.buyerReadyCards?.[0]).toMatchObject({ id: 'id-3' })
  })

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
})
