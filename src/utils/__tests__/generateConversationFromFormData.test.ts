import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateConversationFromFormData } from '../generateConversationFromFormData'

describe('generateConversationFromFormData', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the filing year in H1 when current_year_data.year is absent', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))

    const messages = generateConversationFromFormData(
      {
        company_name: 'Acme BV',
        revenue: 1_500_000,
        ebitda: 250_000,
      } as any,
      'report-123'
    )

    expect(messages.some((message) => message.content === 'What was your revenue in 2024?')).toBe(true)
    expect(messages.some((message) => message.content === 'What was your EBITDA in 2024?')).toBe(true)
  })

  it('preserves an explicit current_year_data.year when provided', () => {
    const messages = generateConversationFromFormData(
      {
        company_name: 'Acme BV',
        current_year_data: {
          year: 2022,
          revenue: 1_500_000,
          ebitda: 250_000,
        },
      } as any,
      'report-456'
    )

    expect(messages.some((message) => message.content === 'What was your revenue in 2022?')).toBe(true)
    expect(messages.some((message) => message.content === 'What was your EBITDA in 2022?')).toBe(true)
  })
})
