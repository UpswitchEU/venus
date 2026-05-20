import { beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('stores a validated local fallback when backend submission fails', async () => {
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
      {
        suggestion: 'Existing',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
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
