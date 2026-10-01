import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockApiPost, mockAxiosCreate, mockLogger } = vi.hoisted(() => {
  const mockApiPost = vi.fn()
  const mockAxiosCreate = vi.fn(() => ({
    post: mockApiPost,
  }))
  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }

  return { mockApiPost, mockAxiosCreate, mockLogger }
})

vi.mock('axios', () => ({
  default: {
    create: mockAxiosCreate,
  },
}))

vi.mock('../utils/getMercuryUrl', () => ({
  getApiUrl: () => 'https://titan.test/api',
}))

vi.mock('../utils/logger', () => ({
  generalLogger: mockLogger,
}))

const STORAGE_KEY = 'business_type_suggestions'

describe('suggestionService', () => {
  afterEach(() => vi.useRealTimers())
  beforeEach(() => {
    mockApiPost.mockReset()
    mockLogger.debug.mockClear()
    mockLogger.error.mockClear()
    mockLogger.info.mockClear()
    mockLogger.warn.mockClear()
    localStorage.clear()
  })

  it('submits trimmed suggestions without writing local fallback data', async () => {
    const { suggestionService } = await import('./businessTypeSuggestionApi')
    mockApiPost.mockResolvedValueOnce({ data: { success: true } })

    await suggestionService.submitSuggestion({
      suggestion: '  Vertical AI compliance workflows  ',
      user_id: ' user-123 ',
      context: {
        industry: ' Software ',
        similar_to: '',
        description: '  Regulated workflow automation  ',
        search_query: ' compliance ai ',
      },
    })

    expect(mockApiPost).toHaveBeenCalledWith('/suggest', {
      suggestion: 'Vertical AI compliance workflows',
      user_id: 'user-123',
      context: {
        industry: 'Software',
        description: 'Regulated workflow automation',
        search_query: 'compliance ai',
      },
    })
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('ignores empty suggestions before network submission', async () => {
    const { suggestionService } = await import('./businessTypeSuggestionApi')

    await suggestionService.submitSuggestion({ suggestion: '   ' })

    expect(mockApiPost).not.toHaveBeenCalled()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[BusinessTypeSuggestion] Ignoring empty suggestion'
    )
  })

  it('drops unbounded legacy data and stores a TTL fallback when submission fails', async () => {
    const { suggestionService } = await import('./businessTypeSuggestionApi')
    mockApiPost.mockRejectedValueOnce(new Error('offline'))
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { suggestion: 'Existing', timestamp: '2026-01-01T00:00:00.000Z' },
        { suggestion: '', timestamp: '2026-01-01T00:00:00.000Z' },
        { suggestion: 'Missing timestamp' },
      ])
    )

    await suggestionService.submitSuggestion({ suggestion: '  New vertical  ' })

    expect(suggestionService.getLocalSuggestions()).toEqual([
      expect.objectContaining({
        suggestion: 'New vertical',
        timestamp: expect.any(String),
      }),
    ])
  })

  it('keeps only the latest local fallback suggestions', async () => {
    const { suggestionService } = await import('./businessTypeSuggestionApi')
    mockApiPost.mockRejectedValue(new Error('offline'))

    for (let index = 0; index < 52; index++) {
      await suggestionService.submitSuggestion({ suggestion: `Suggestion ${index}` })
    }

    const suggestions = suggestionService.getLocalSuggestions()
    expect(suggestions).toHaveLength(50)
    expect(suggestions[0].suggestion).toBe('Suggestion 2')
    expect(suggestions.at(-1)?.suggestion).toBe('Suggestion 51')
  })
})

it('never retains identity/context and expires individual suggestions even when new items arrive', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
  const { suggestionService } = await import('./businessTypeSuggestionApi')
  mockApiPost.mockRejectedValue(new Error('offline'))
  localStorage.clear()
  await suggestionService.submitSuggestion({
    suggestion: 'Old',
    user_id: 'private-user',
    context: { description: 'Private company' },
  })
  expect(localStorage.getItem(STORAGE_KEY)).not.toContain('private-user')
  expect(localStorage.getItem(STORAGE_KEY)).not.toContain('Private company')
  vi.advanceTimersByTime(23 * 60 * 60 * 1000)
  await suggestionService.submitSuggestion({ suggestion: 'New' })
  vi.advanceTimersByTime(2 * 60 * 60 * 1000)
  expect(suggestionService.getLocalSuggestions().map((item) => item.suggestion)).toEqual(['New'])
  vi.advanceTimersByTime(24 * 60 * 60 * 1000)
  expect(suggestionService.getLocalSuggestions()).toEqual([])
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  vi.useRealTimers()
})
