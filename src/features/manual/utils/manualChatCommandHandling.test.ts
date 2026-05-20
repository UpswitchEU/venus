// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ChatMessage, ParsedCommand, ParsedValue } from '@/components/calculator'
import {
  buildManualChatRetryPlan,
  buildPendingUpdatesFromDetectedValues,
  formatManualParsedCommandResponse,
} from './manualChatCommandHandling'

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'message',
    role: 'assistant',
    content: '',
    timestamp: new Date('2026-05-15T10:00:00.000Z'),
    ...overrides,
  }
}

describe('manualChatCommandHandling', () => {
  it('maps detected values to pending field updates', () => {
    const detectedValues: ParsedValue[] = [
      { field: 'revenue', label: 'Revenue', value: 500_000, originalText: '500k revenue' },
      { field: 'ebitda', label: 'EBITDA', value: 75_000, originalText: '75k EBITDA' },
    ]

    expect(buildPendingUpdatesFromDetectedValues(detectedValues)).toEqual([
      { field: 'revenue', label: 'Revenue', value: 500_000 },
      { field: 'ebitda', label: 'EBITDA', value: 75_000 },
    ])
  })

  it('returns an empty list when no detected values exist', () => {
    expect(buildPendingUpdatesFromDetectedValues(undefined)).toEqual([])
    expect(buildPendingUpdatesFromDetectedValues([])).toEqual([])
  })

  it('formats parsed command response using the active locale', () => {
    const parsedCommands: ParsedCommand[] = [
      {
        type: 'normalize',
        field: 'ownerSalary',
        label: 'Eigenaarssalaris',
        value: 60_000,
        originalText: 'Normaliseer eigenaarssalaris naar 60k',
      },
    ]

    expect(
      formatManualParsedCommandResponse({
        parsedCommands,
        currentLocale: 'nl',
        heading: 'Toegepast',
      })
    ).toBe('Toegepast\n\n- **Eigenaarssalaris** → €60.000')

    expect(
      formatManualParsedCommandResponse({
        parsedCommands,
        currentLocale: 'en',
        heading: 'Applied',
      })
    ).toBe('Applied\n\n- **Eigenaarssalaris** → €60.000')
  })

  it('builds a retry plan and removes the failed turn so the prompt is not duplicated', () => {
    const messages = [
      message({ id: 'user-1', role: 'user', content: 'first prompt' }),
      message({ id: 'assistant-1', role: 'assistant', content: 'answer' }),
      message({ id: 'user-2', role: 'user', content: 'retry this prompt' }),
      message({ id: 'error-1', role: 'assistant', content: 'failed', isError: true }),
    ]

    expect(buildManualChatRetryPlan(messages, 'error-1')).toEqual({
      retryPrompt: 'retry this prompt',
      messages: messages.slice(0, 2),
    })
  })

  it('does not build a retry plan when the failed message or previous user prompt is missing', () => {
    expect(buildManualChatRetryPlan([], 'missing')).toBeNull()
    expect(
      buildManualChatRetryPlan(
        [message({ id: 'error-1', role: 'assistant', content: 'failed', isError: true })],
        'error-1'
      )
    ).toBeNull()
  })
})
