// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { mapStoredMessagesToManualChatMessages } from './manualChatHistory'
import { restoreManualChatProposals } from './manualChatProposalRestore'

function history(isAddback: boolean) {
  return mapStoredMessagesToManualChatMessages([
    {
      id: 'assistant',
      role: 'assistant',
      type: 'ai',
      content: 'Review this adjustment.',
      timestamp: new Date(),
      metadata: {
        persistedToolResults: [
          {
            id: 'tool-1',
            toolName: 'suggest_normalization',
            result: {
              suggestion: {
                amount: 20_000,
                is_addback: isAddback,
                fiscal_year: 2024,
                category: 'owner_salary',
                description: 'Owner salary',
                justification: 'Above market',
              },
            },
          },
          {
            id: 'tool-2',
            toolName: 'update_field_value',
            result: {
              update: {
                field: 'revenue',
                value: 2_500_000,
                fiscal_year: 2024,
                label: 'Revenue',
              },
            },
          },
        ],
      },
    },
  ])
}

describe('financial proposals restored across apps', () => {
  it.each([
    true,
    false,
  ])('preserves year, direction (%s), explanation and a stable approval identity', (isAddback) => {
    const first = restoreManualChatProposals(history(isAddback), [], 2025)
    const amount = isAddback ? 20_000 : -20_000
    expect(first.items[0]).toMatchObject({
      id: 'history-tool-1-0',
      adjustment: amount,
      type: isAddback ? 'add' : 'subtract',
      year: 2024,
      category: 'salary',
      backendCategory: 'owner_compensation_adjustment',
      reason: 'Above market',
      status: 'pending',
    })
    expect(first.messages[0].normalisationSuggestions?.[0]).toMatchObject({
      amount,
      fiscalYear: 2024,
      reason: 'Above market',
    })
    expect(first.fieldUpdates).toEqual([
      { field: 'revenue.2024', value: 2_500_000, label: 'Revenue (2024)', source: 'ai' },
    ])
    const second = restoreManualChatProposals(
      history(isAddback),
      [{ ...first.items[0], status: 'accepted' }],
      2025
    )
    expect(second.items).toHaveLength(0)
    expect(second.messages[0].normalisationSuggestions?.[0].status).toBe('accepted')
  })

  it('reuses a persisted decision from an older live card instead of duplicating the adjustment', () => {
    const first = restoreManualChatProposals(history(true), [], 2025)
    const restored = restoreManualChatProposals(
      history(true),
      [{ ...first.items[0], id: 'old-live-id', status: 'rejected' }],
      2025
    )
    expect(restored.items).toHaveLength(0)
    expect(restored.messages[0].normalisationSuggestions?.[0]).toMatchObject({
      id: 'old-live-id',
      status: 'rejected',
    })
  })
})
