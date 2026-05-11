/**
 * Tests for `parseAIChatToolResults` — the Venus-side tool-results
 * parser that builds the AIChatResponse arrays consumed by the
 * ChatAssistantDrawer.
 *
 * Mirrors `apps/mercury/tests/unit/ai-dock-tool-card-parser.test.ts`'s
 * `parseToolResultsToCards` tests but exercises Venus's distinct output
 * shape (separate per-kind arrays instead of a single discriminated union).
 *
 * Pins for every kind: pending + blocked branches, missing-fields
 * defensive drops, unknown-type forward-compat skip, non-array input
 * tolerance.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  dispatchAIChatChunk,
  makeChunkDispatchState,
  parseAIChatToolResults,
} from '../tool-results-parser'

describe('parseAIChatToolResults — input tolerance', () => {
  it('returns empty arrays for non-array input', () => {
    const empty = {
      normalisationSuggestions: [],
      fieldUpdates: [],
      valuationRunRequests: [],
      reportGenerationRequests: [],
      sellabilityRunRequests: [],
    }
    expect(parseAIChatToolResults(undefined)).toEqual(empty)
    expect(parseAIChatToolResults(null)).toEqual(empty)
    expect(parseAIChatToolResults('not-an-array')).toEqual(empty)
    expect(parseAIChatToolResults({})).toEqual(empty)
    expect(parseAIChatToolResults(42)).toEqual(empty)
  })

  it('returns empty arrays for empty input array', () => {
    expect(parseAIChatToolResults([])).toEqual({
      normalisationSuggestions: [],
      fieldUpdates: [],
      valuationRunRequests: [],
      reportGenerationRequests: [],
      sellabilityRunRequests: [],
    })
  })

  it('silently skips entries missing `type` (defensive against malformed envelopes)', () => {
    const result = parseAIChatToolResults([
      { data: {} }, // no type
      null,
      'string-entry',
      { type: null, data: {} },
    ])
    expect(result.normalisationSuggestions).toEqual([])
    expect(result.fieldUpdates).toEqual([])
  })

  it('silently skips unknown `type` values (forward-compat for future Titan tools)', () => {
    const result = parseAIChatToolResults([
      { type: 'future_tool_we_dont_know', data: { something: 1 } },
      { type: 'normalization_suggestion', data: { category: 'rent' } },
    ])
    // Known type still landed; unknown type didn't land anywhere.
    expect(result.normalisationSuggestions).toEqual([{ category: 'rent' }])
  })
})

// ---------------------------------------------------------------------
// normalization_suggestion
// ---------------------------------------------------------------------

describe('normalization_suggestion', () => {
  it('appends data verbatim to normalisationSuggestions', () => {
    const result = parseAIChatToolResults([
      {
        type: 'normalization_suggestion',
        data: { category: 'salary', amount: 50000, description: 'CEO comp' },
      },
    ])
    expect(result.normalisationSuggestions).toHaveLength(1)
    expect(result.normalisationSuggestions[0]).toMatchObject({
      category: 'salary',
      amount: 50000,
    })
  })

  it('skips when data is missing or non-object', () => {
    const result = parseAIChatToolResults([
      { type: 'normalization_suggestion' },
      { type: 'normalization_suggestion', data: null },
      { type: 'normalization_suggestion', data: 'string' },
    ])
    expect(result.normalisationSuggestions).toEqual([])
  })
})

// ---------------------------------------------------------------------
// field_update
// ---------------------------------------------------------------------

describe('field_update', () => {
  it('parses a valid field_update envelope', () => {
    const result = parseAIChatToolResults([
      {
        type: 'field_update',
        data: {
          update: {
            field: 'revenue',
            value: 100000,
            label: 'Revenue',
            confidence: 'high',
          },
        },
      },
    ])
    expect(result.fieldUpdates).toEqual([
      {
        field: 'revenue',
        value: 100000,
        label: 'Revenue',
        source: 'ai',
        confidence: 'high',
      },
    ])
  })

  it('accepts string + boolean values (not just number)', () => {
    const result = parseAIChatToolResults([
      {
        type: 'field_update',
        data: {
          update: { field: 'business_type', value: 'Software', label: 'Type' },
        },
      },
      {
        type: 'field_update',
        data: {
          update: { field: 'is_active', value: true, label: 'Active' },
        },
      },
    ])
    expect(result.fieldUpdates).toHaveLength(2)
    expect(result.fieldUpdates[0].value).toBe('Software')
    expect(result.fieldUpdates[1].value).toBe(true)
  })

  it('drops field_update with missing field', () => {
    const result = parseAIChatToolResults([
      {
        type: 'field_update',
        data: { update: { value: 100, label: 'X' } },
      },
    ])
    expect(result.fieldUpdates).toEqual([])
  })

  it('drops field_update with non-string/number/boolean value', () => {
    const result = parseAIChatToolResults([
      {
        type: 'field_update',
        data: { update: { field: 'x', value: { nested: 1 }, label: 'Y' } },
      },
    ])
    expect(result.fieldUpdates).toEqual([])
  })

  it('drops field_update with non-string label', () => {
    const result = parseAIChatToolResults([
      {
        type: 'field_update',
        data: { update: { field: 'x', value: 1, label: 42 } },
      },
    ])
    expect(result.fieldUpdates).toEqual([])
  })

  it('omits confidence when not one of high/medium/low (silently drops the field)', () => {
    const result = parseAIChatToolResults([
      {
        type: 'field_update',
        data: {
          update: {
            field: 'x',
            value: 1,
            label: 'Y',
            confidence: 'maybe-ish', // not a valid enum value
          },
        },
      },
    ])
    expect(result.fieldUpdates).toHaveLength(1)
    expect(result.fieldUpdates[0]).not.toHaveProperty('confidence')
    expect(result.fieldUpdates[0].source).toBe('ai')
  })

  it('always stamps source="ai" (drawer uses it to distinguish from manual/KBO/Yuki)', () => {
    const result = parseAIChatToolResults([
      {
        type: 'field_update',
        data: {
          update: {
            field: 'x',
            value: 1,
            label: 'Y',
            source: 'fake_caller_supplied',
          },
        },
      },
    ])
    expect(result.fieldUpdates[0].source).toBe('ai')
  })
})

// ---------------------------------------------------------------------
// valuation_run_request
// ---------------------------------------------------------------------

describe('valuation_run_request', () => {
  it('parses pending_approval with full request payload', () => {
    const inputs_summary = {
      business_name: 'Acme NV',
      business_type: 'Software',
      industry: 'tech',
      revenue: '100000',
      ebitda: '20000',
      ebitda_normalized: '22000',
      pending_normalizations: 2,
      applied_normalizations: 3,
    }
    const result = parseAIChatToolResults([
      {
        type: 'valuation_run_request',
        data: {
          status: 'pending_approval',
          request: {
            report_id: 'rep-uuid',
            methods: ['multiple', 'dcf'],
            estimated_credits: 5,
            inputs_summary,
            note: 'AI thinks this is ready',
          },
          message: 'Proposed valuation run',
        },
      },
    ])
    expect(result.valuationRunRequests).toEqual([
      {
        status: 'pending_approval',
        reportId: 'rep-uuid',
        methods: ['multiple', 'dcf'],
        estimatedCredits: 5,
        inputsSummary: inputs_summary,
        note: 'AI thinks this is ready',
        message: 'Proposed valuation run',
      },
    ])
  })

  it('parses blocked branch with reason + missing fields', () => {
    const result = parseAIChatToolResults([
      {
        type: 'valuation_run_request',
        data: {
          status: 'blocked',
          reason: 'missing_inputs',
          missing: ['revenue', 'ebitda'],
          message: 'Need revenue + EBITDA',
        },
      },
    ])
    expect(result.valuationRunRequests).toEqual([
      {
        status: 'blocked',
        reason: 'missing_inputs',
        missing: ['revenue', 'ebitda'],
        message: 'Need revenue + EBITDA',
      },
    ])
  })

  it('drops pending_approval without a `request` payload (invalid envelope)', () => {
    const result = parseAIChatToolResults([
      {
        type: 'valuation_run_request',
        data: { status: 'pending_approval' /* missing request */ },
      },
    ])
    expect(result.valuationRunRequests).toEqual([])
  })

  it('defaults methods to null when not an array', () => {
    const result = parseAIChatToolResults([
      {
        type: 'valuation_run_request',
        data: {
          status: 'pending_approval',
          request: { methods: 'not-an-array' },
        },
      },
    ])
    expect(result.valuationRunRequests).toHaveLength(1)
    expect((result.valuationRunRequests[0] as { methods?: unknown }).methods).toBeNull()
  })

  it('defaults note to null when missing', () => {
    const result = parseAIChatToolResults([
      {
        type: 'valuation_run_request',
        data: { status: 'pending_approval', request: {} },
      },
    ])
    expect((result.valuationRunRequests[0] as { note?: unknown }).note).toBeNull()
  })
})

// ---------------------------------------------------------------------
// report_generation_request
// ---------------------------------------------------------------------

describe('report_generation_request', () => {
  it('parses pending_approval with result_summary', () => {
    const result_summary = {
      business_name: 'Acme',
      business_type: 'Software',
      valuation_method: 'multiple',
      currency: 'EUR',
      midpoint: 1_000_000,
      min: 800_000,
      max: 1_200_000,
      confidence_score: 0.8,
      calculated_at: '2026-05-11T12:00:00Z',
    }
    const result = parseAIChatToolResults([
      {
        type: 'report_generation_request',
        data: {
          status: 'pending_approval',
          request: {
            report_id: 'rep-uuid',
            estimated_credits: 0,
            result_summary,
          },
          message: 'Ready to render PDF',
        },
      },
    ])
    expect(result.reportGenerationRequests).toEqual([
      {
        status: 'pending_approval',
        reportId: 'rep-uuid',
        estimatedCredits: 0,
        resultSummary: result_summary,
        note: null,
        message: 'Ready to render PDF',
      },
    ])
  })

  it('parses blocked branch (no_valuation_yet)', () => {
    const result = parseAIChatToolResults([
      {
        type: 'report_generation_request',
        data: {
          status: 'blocked',
          reason: 'no_valuation_yet',
          message: 'Compute first',
        },
      },
    ])
    expect(result.reportGenerationRequests).toEqual([
      {
        status: 'blocked',
        reason: 'no_valuation_yet',
        message: 'Compute first',
      },
    ])
  })
})

// ---------------------------------------------------------------------
// sellability_run_request
// ---------------------------------------------------------------------

describe('sellability_run_request', () => {
  it('parses pending_approval with answers + currentScore', () => {
    const answers = {
      q1_top3_concentration_pct: 42,
      q2_contracted_share: '25_75',
      q3_books_cleanliness: 'clean_external_audit',
    }
    const currentScore = { score: 60, band: 'foundations_in_place', computed_at: '2026-05-01' }
    const result = parseAIChatToolResults([
      {
        type: 'sellability_run_request',
        data: {
          status: 'pending_approval',
          request: {
            estimated_credits: 0,
            answers,
            current_score: currentScore,
          },
          message: 'Recompute sellability',
        },
      },
    ])
    expect(result.sellabilityRunRequests).toEqual([
      {
        status: 'pending_approval',
        estimatedCredits: 0,
        answers,
        currentScore,
        note: null,
        message: 'Recompute sellability',
      },
    ])
  })

  it('defaults currentScore to null when missing (drawer renders "no current score")', () => {
    const result = parseAIChatToolResults([
      {
        type: 'sellability_run_request',
        data: { status: 'pending_approval', request: {} },
      },
    ])
    expect(
      (result.sellabilityRunRequests[0] as { currentScore?: unknown }).currentScore,
    ).toBeNull()
  })

  it('parses blocked branch (profile_incomplete) with missing array', () => {
    const result = parseAIChatToolResults([
      {
        type: 'sellability_run_request',
        data: {
          status: 'blocked',
          reason: 'profile_incomplete',
          missing: ['q1_top3_concentration_pct', 'q3_books_cleanliness'],
          message: 'Fill Q1 + Q3 first',
        },
      },
    ])
    expect(result.sellabilityRunRequests).toEqual([
      {
        status: 'blocked',
        reason: 'profile_incomplete',
        missing: ['q1_top3_concentration_pct', 'q3_books_cleanliness'],
        message: 'Fill Q1 + Q3 first',
      },
    ])
  })
})

// ---------------------------------------------------------------------
// Combined / smoke
// ---------------------------------------------------------------------

describe('combined output', () => {
  it('routes a multi-kind turn into the correct arrays without cross-contamination', () => {
    const result = parseAIChatToolResults([
      {
        type: 'normalization_suggestion',
        data: { category: 'rent', amount: 1000 },
      },
      {
        type: 'field_update',
        data: { update: { field: 'revenue', value: 100, label: 'Rev' } },
      },
      {
        type: 'valuation_run_request',
        data: { status: 'blocked', reason: 'x', missing: ['y'] },
      },
      {
        type: 'report_generation_request',
        data: { status: 'pending_approval', request: { report_id: 'r1' } },
      },
      {
        type: 'sellability_run_request',
        data: { status: 'blocked', reason: 'profile_incomplete' },
      },
    ])
    expect(result.normalisationSuggestions).toHaveLength(1)
    expect(result.fieldUpdates).toHaveLength(1)
    expect(result.valuationRunRequests).toHaveLength(1)
    expect(result.reportGenerationRequests).toHaveLength(1)
    expect(result.sellabilityRunRequests).toHaveLength(1)
  })

  it('accumulates multiple entries of the same kind in order', () => {
    const result = parseAIChatToolResults([
      {
        type: 'normalization_suggestion',
        data: { category: 'rent' },
      },
      {
        type: 'normalization_suggestion',
        data: { category: 'salary' },
      },
      {
        type: 'normalization_suggestion',
        data: { category: 'advisor_fees' },
      },
    ])
    expect(result.normalisationSuggestions).toHaveLength(3)
    expect((result.normalisationSuggestions[0] as { category: string }).category).toBe('rent')
    expect((result.normalisationSuggestions[2] as { category: string }).category).toBe(
      'advisor_fees',
    )
  })
})

// ---------------------------------------------------------------------
// dispatchAIChatChunk
// ---------------------------------------------------------------------

function freshCallbacks() {
  return {
    onText: vi.fn(),
    onToolStart: vi.fn(),
    onToolResult: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  }
}

describe('dispatchAIChatChunk — input tolerance', () => {
  it('is a noop for null / non-object / missing-type input', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    dispatchAIChatChunk(null, state, cb)
    dispatchAIChatChunk(undefined, state, cb)
    dispatchAIChatChunk('string', state, cb)
    dispatchAIChatChunk({}, state, cb)
    dispatchAIChatChunk({ type: 42 }, state, cb)

    expect(cb.onText).not.toHaveBeenCalled()
    expect(cb.onToolStart).not.toHaveBeenCalled()
    expect(cb.onDone).not.toHaveBeenCalled()
    expect(cb.onError).not.toHaveBeenCalled()
  })

  it('silently skips unknown type values (forward-compat for new Titan chunk types)', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk(
      { type: 'future_chunk_kind', content: 'data' },
      makeChunkDispatchState(),
      cb,
    )
    expect(cb.onText).not.toHaveBeenCalled()
  })
})

describe('dispatchAIChatChunk — text chunks', () => {
  it('fires onText with content when present', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk({ type: 'text', content: 'Hello' }, makeChunkDispatchState(), cb)
    expect(cb.onText).toHaveBeenCalledWith('Hello')
  })

  it('does NOT fire onText when content is empty string (no noise)', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk({ type: 'text', content: '' }, makeChunkDispatchState(), cb)
    expect(cb.onText).not.toHaveBeenCalled()
  })

  it('does NOT fire onText when content is missing entirely', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk({ type: 'text', conversationId: 'cv-1' }, makeChunkDispatchState(), cb)
    expect(cb.onText).not.toHaveBeenCalled()
  })

  it('captures conversationId from text chunk into state (used as done fallback)', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    dispatchAIChatChunk(
      { type: 'text', conversationId: 'cv-from-text', content: 'hi' },
      state,
      cb,
    )
    expect(state.resolvedConversationId).toBe('cv-from-text')
  })

  it('does NOT overwrite captured conversationId when subsequent text chunk has empty conversationId', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    dispatchAIChatChunk(
      { type: 'text', conversationId: 'cv-first', content: 'hi' },
      state,
      cb,
    )
    dispatchAIChatChunk(
      { type: 'text', conversationId: '', content: 'more' },
      state,
      cb,
    )
    expect(state.resolvedConversationId).toBe('cv-first')
  })
})

describe('dispatchAIChatChunk — tool chunks', () => {
  it('fires onToolStart with toolName', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk(
      { type: 'tool_start', toolName: 'run_valuation' },
      makeChunkDispatchState(),
      cb,
    )
    expect(cb.onToolStart).toHaveBeenCalledWith('run_valuation')
  })

  it('does NOT fire onToolStart when toolName is missing (defensive against malformed envelope)', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk({ type: 'tool_start' }, makeChunkDispatchState(), cb)
    expect(cb.onToolStart).not.toHaveBeenCalled()
  })

  it('fires onToolResult with toolName + toolResult', () => {
    const cb = freshCallbacks()
    const result = { type: 'normalization_suggestion', data: { category: 'rent' } }
    dispatchAIChatChunk(
      { type: 'tool_result', toolName: 'suggest_normalization', toolResult: result },
      makeChunkDispatchState(),
      cb,
    )
    expect(cb.onToolResult).toHaveBeenCalledWith('suggest_normalization', result)
  })

  it('passes undefined toolResult through when missing (consumer handles)', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk(
      { type: 'tool_result', toolName: 'noop_tool' },
      makeChunkDispatchState(),
      cb,
    )
    expect(cb.onToolResult).toHaveBeenCalledWith('noop_tool', undefined)
  })
})

describe('dispatchAIChatChunk — terminal chunks', () => {
  it('fires onDone with chunk.conversationId when present (preferred over captured)', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    state.resolvedConversationId = 'cv-from-earlier-text'
    dispatchAIChatChunk(
      { type: 'done', conversationId: 'cv-from-done' },
      state,
      cb,
    )
    expect(cb.onDone).toHaveBeenCalledWith('cv-from-done')
    expect(state.doneReceived).toBe(true)
  })

  it('falls back to captured conversationId when done chunk has none', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    state.resolvedConversationId = 'cv-from-earlier-text'
    dispatchAIChatChunk({ type: 'done' }, state, cb)
    expect(cb.onDone).toHaveBeenCalledWith('cv-from-earlier-text')
  })

  it('passes undefined to onDone when neither chunk nor state has a conversationId', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk({ type: 'done' }, makeChunkDispatchState(), cb)
    expect(cb.onDone).toHaveBeenCalledWith(undefined)
  })

  it('flips doneReceived to true on done (caller skips fallback onDone)', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    dispatchAIChatChunk({ type: 'done' }, state, cb)
    expect(state.doneReceived).toBe(true)
  })

  it('fires onError with chunk.error and flips doneReceived', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    dispatchAIChatChunk({ type: 'error', error: 'Rate limited' }, state, cb)
    expect(cb.onError).toHaveBeenCalledWith('Rate limited')
    expect(state.doneReceived).toBe(true)
  })

  it('falls back to "Unknown error" when error chunk has no error field', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk({ type: 'error' }, makeChunkDispatchState(), cb)
    expect(cb.onError).toHaveBeenCalledWith('Unknown error')
  })

  it('falls back to "Unknown error" when error field is empty string (no blank toast)', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk({ type: 'error', error: '' }, makeChunkDispatchState(), cb)
    expect(cb.onError).toHaveBeenCalledWith('Unknown error')
  })
})

describe('dispatchAIChatChunk — state threading across multiple chunks', () => {
  it('preserves captured conversationId across text → done sequence', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    dispatchAIChatChunk(
      { type: 'text', conversationId: 'cv-x', content: 'streaming' },
      state,
      cb,
    )
    dispatchAIChatChunk({ type: 'text', content: 'more text' }, state, cb)
    dispatchAIChatChunk({ type: 'done' }, state, cb)

    expect(cb.onDone).toHaveBeenCalledWith('cv-x')
  })

  it('handles missing optional callbacks gracefully (consumer didn\'t wire them)', () => {
    // The dispatcher uses optional chaining — passing partial callbacks
    // should be a non-throwing no-op for unhandled chunk types.
    const onlyText = { onText: vi.fn() }
    dispatchAIChatChunk({ type: 'tool_start', toolName: 'x' }, makeChunkDispatchState(), onlyText)
    dispatchAIChatChunk({ type: 'done' }, makeChunkDispatchState(), onlyText)
    dispatchAIChatChunk({ type: 'error', error: 'x' }, makeChunkDispatchState(), onlyText)
    // No assertion needed — just confirming no throw.
    expect(onlyText.onText).not.toHaveBeenCalled()
  })
})
