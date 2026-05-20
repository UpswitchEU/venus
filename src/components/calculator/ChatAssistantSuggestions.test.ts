import { describe, expect, it } from 'vitest'
import { getContextualSuggestionKeys } from './ChatAssistantSuggestions'

describe('getContextualSuggestionKeys', () => {
  it('starts an unfinished valuation with worth, report, and normalization prompts', () => {
    expect(getContextualSuggestionKeys({}).map((item) => item.key)).toEqual([
      'suggestions.whatWorth',
      'suggestions.generateReport',
      'suggestions.whichNorms',
    ])
  })

  it('switches to explanation prompts after a report exists', () => {
    expect(getContextualSuggestionKeys({ hasReport: true }).map((item) => item.key)).toEqual([
      'suggestions.explainValue',
      'suggestions.whichNorms',
      'suggestions.askQuestion',
    ])
  })

  it('surfaces pending normalization and EBITDA context when available', () => {
    expect(
      getContextualSuggestionKeys({
        hasReport: true,
        hasEbitda: true,
        pendingNormalizationsCount: 2,
      }).map((item) => item.key)
    ).toEqual([
      'suggestions.explainValue',
      'suggestions.whichNorms',
      'suggestions.whichNormsApply',
      'suggestions.explainEbitda',
    ])
  })

  it('extracts the EBITDA year from the active field label', () => {
    expect(
      getContextualSuggestionKeys({
        hasEbitda: true,
        fieldContext: {
          field: 'ebitda',
          label: 'EBITDA 2024',
        },
      })
    ).toContainEqual({ key: 'suggestions.explainEbitdaFor', params: { year: '2024' } })
  })
})
