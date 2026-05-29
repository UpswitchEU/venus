import { describe, expect, it, vi } from 'vitest'
import {
  extractRecoveredAnswerFromHistory,
  type PersistedHistoryMessage,
  pollHistoryForPersistedAnswer,
} from './manualChatPersistedAnswerRecovery'

const noSleep = () => Promise.resolve()

describe('extractRecoveredAnswerFromHistory', () => {
  it('returns the assistant answer that follows the matching user turn', () => {
    const messages: PersistedHistoryMessage[] = [
      { role: 'user', content: 'Help mij dit bedrijf transactieklaar maken' },
      { role: 'assistant', content: 'Hier zijn de stappen om transactieklaar te worden…' },
    ]
    expect(
      extractRecoveredAnswerFromHistory(messages, 'Help mij dit bedrijf transactieklaar maken')
    ).toEqual({ content: 'Hier zijn de stappen om transactieklaar te worden…' })
  })

  it('returns null when the user turn has not been persisted yet (keep polling)', () => {
    const messages: PersistedHistoryMessage[] = [
      { role: 'user', content: 'een eerdere vraag' },
      { role: 'assistant', content: 'een eerder antwoord' },
    ]
    expect(extractRecoveredAnswerFromHistory(messages, 'nieuwe vraag')).toBeNull()
  })

  it('returns null when only the user turn landed (assistant not persisted yet)', () => {
    const messages: PersistedHistoryMessage[] = [{ role: 'user', content: 'mijn vraag' }]
    expect(extractRecoveredAnswerFromHistory(messages, 'mijn vraag')).toBeNull()
  })

  it('ignores an empty/whitespace assistant message', () => {
    const messages: PersistedHistoryMessage[] = [
      { role: 'user', content: 'mijn vraag' },
      { role: 'assistant', content: '   ' },
    ]
    expect(extractRecoveredAnswerFromHistory(messages, 'mijn vraag')).toBeNull()
  })

  it('does not return a stale answer that precedes the user turn', () => {
    const messages: PersistedHistoryMessage[] = [
      { role: 'assistant', content: 'stale antwoord van vorige beurt' },
      { role: 'user', content: 'mijn vraag' },
    ]
    expect(extractRecoveredAnswerFromHistory(messages, 'mijn vraag')).toBeNull()
  })

  it('picks the latest assistant message when the turn was double-persisted', () => {
    const messages: PersistedHistoryMessage[] = [
      { role: 'user', content: 'mijn vraag' },
      { role: 'assistant', content: 'eerste persist' },
      { role: 'assistant', content: 'tweede persist (definitief)' },
    ]
    expect(extractRecoveredAnswerFromHistory(messages, 'mijn vraag')).toEqual({
      content: 'tweede persist (definitief)',
    })
  })

  it('matches the LAST occurrence of a repeated user prompt', () => {
    const messages: PersistedHistoryMessage[] = [
      { role: 'user', content: 'leg uit' },
      { role: 'assistant', content: 'oude uitleg' },
      { role: 'user', content: 'leg uit' },
      { role: 'assistant', content: 'nieuwe uitleg' },
    ]
    expect(extractRecoveredAnswerFromHistory(messages, 'leg uit')).toEqual({
      content: 'nieuwe uitleg',
    })
  })
})

describe('pollHistoryForPersistedAnswer', () => {
  it('resolves with the answer once it appears on a later poll', async () => {
    const loadHistory = vi
      .fn()
      .mockResolvedValueOnce({ messages: [{ role: 'user', content: 'vraag' }] })
      .mockResolvedValueOnce({
        messages: [
          { role: 'user', content: 'vraag' },
          { role: 'assistant', content: 'het antwoord' },
        ],
      })

    const result = await pollHistoryForPersistedAnswer({
      loadHistory,
      reportId: 'report-1',
      userContent: 'vraag',
      attempts: 4,
      sleep: noSleep,
    })

    expect(result).toEqual({ content: 'het antwoord' })
    expect(loadHistory).toHaveBeenCalledTimes(2)
  })

  it('returns null after attempts are exhausted', async () => {
    const loadHistory = vi
      .fn()
      .mockResolvedValue({ messages: [{ role: 'user', content: 'vraag' }] })

    const result = await pollHistoryForPersistedAnswer({
      loadHistory,
      reportId: 'report-1',
      userContent: 'vraag',
      attempts: 3,
      sleep: noSleep,
    })

    expect(result).toBeNull()
    expect(loadHistory).toHaveBeenCalledTimes(3)
  })

  it('stops early when cancelled', async () => {
    const loadHistory = vi.fn().mockResolvedValue({ messages: [] })

    const result = await pollHistoryForPersistedAnswer({
      loadHistory,
      reportId: 'report-1',
      userContent: 'vraag',
      attempts: 5,
      isCancelled: () => true,
      sleep: noSleep,
    })

    expect(result).toBeNull()
    expect(loadHistory).not.toHaveBeenCalled()
  })

  it('tolerates a failing history fetch and keeps polling', async () => {
    const loadHistory = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        messages: [
          { role: 'user', content: 'vraag' },
          { role: 'assistant', content: 'antwoord na herstel' },
        ],
      })

    const result = await pollHistoryForPersistedAnswer({
      loadHistory,
      reportId: 'report-1',
      userContent: 'vraag',
      attempts: 4,
      sleep: noSleep,
    })

    expect(result).toEqual({ content: 'antwoord na herstel' })
    expect(loadHistory).toHaveBeenCalledTimes(2)
  })

  it('does not poll without a reportId', async () => {
    const loadHistory = vi.fn()
    const result = await pollHistoryForPersistedAnswer({
      loadHistory,
      reportId: '',
      userContent: 'vraag',
      sleep: noSleep,
    })
    expect(result).toBeNull()
    expect(loadHistory).not.toHaveBeenCalled()
  })
})
