// @vitest-environment node

/**
 * Tests for `parseAIChatToolResults` — the Venus-side tool-results
 * parser that builds the AIChatResponse arrays consumed by the
 * ChatAssistantDrawer.
 *
 * Mirrors `apps/mercury/tests/unit/ai-dock-tool-card-parser.test.ts`'s
 * `parseToolResultsToCards` tests but exercises Venus's distinct output
 * shape (separate per-kind arrays instead of a single discriminated union).
 */

import { describe, expect, it } from 'vitest'
import aiToolResultContract from '../../../../../../tests/contracts/ai-tool-result-contract.json'
import { parseAIChatToolResults } from '../tool-results-parser'

describe('parseAIChatToolResults — input tolerance', () => {
  it('returns empty arrays for non-array input', () => {
    const empty = {
      normalisationSuggestions: [],
      fieldUpdates: [],
      valuationRunRequests: [],
      bulkValuationRunRequests: [],
      reportGenerationRequests: [],
      sellabilityRunRequests: [],
      ownerProfileAnswerRequests: [],
      integrationConnectRequests: [],
      integrationSyncRequests: [],
      ownerReminderRequests: [],
      ownerInviteAccountantRequests: [],
      listingVisibilityRequests: [],
      listingFieldUpdateRequests: [],
      shareTokenRequests: [],
      shareTokenRevokeRequests: [],
      valuationMethodPreferenceRequests: [],
      acknowledgeWarningRequests: [],
      normalizationDismissRequests: [],
      secureCredentialRequests: [],
      csvUploadRequests: [],
      multiSelectRequests: [],
      singleSelectRequests: [],
      clientCreateRequests: [],
      belgianCompanyBootstraps: [],
      valuationSessionRequests: [],
      clientDataReadinessPreviews: [],
      importReviewRequests: [],
      methodReadinessPreviews: [],
      workspaceClientsPreviews: [],
      listingPreviews: [],
      listingCreateRequests: [],
      valuationDefaultsRequests: [],
      valuationDefaultsPreviews: [],
      buyerProfilePreviews: [],
      registrySearchResults: [],
      businessTypeSearchResults: [],
      syncStatusPreviews: [],
      buyerReadyCards: [],
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
      bulkValuationRunRequests: [],
      reportGenerationRequests: [],
      sellabilityRunRequests: [],
      ownerProfileAnswerRequests: [],
      integrationConnectRequests: [],
      integrationSyncRequests: [],
      ownerReminderRequests: [],
      ownerInviteAccountantRequests: [],
      listingVisibilityRequests: [],
      listingFieldUpdateRequests: [],
      shareTokenRequests: [],
      shareTokenRevokeRequests: [],
      valuationMethodPreferenceRequests: [],
      acknowledgeWarningRequests: [],
      normalizationDismissRequests: [],
      secureCredentialRequests: [],
      csvUploadRequests: [],
      multiSelectRequests: [],
      singleSelectRequests: [],
      clientCreateRequests: [],
      belgianCompanyBootstraps: [],
      valuationSessionRequests: [],
      clientDataReadinessPreviews: [],
      importReviewRequests: [],
      methodReadinessPreviews: [],
      workspaceClientsPreviews: [],
      listingPreviews: [],
      listingCreateRequests: [],
      valuationDefaultsRequests: [],
      valuationDefaultsPreviews: [],
      buyerProfilePreviews: [],
      registrySearchResults: [],
      businessTypeSearchResults: [],
      syncStatusPreviews: [],
      buyerReadyCards: [],
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

  it('keeps the Venus parsed envelope fixture aligned with Titan renderable outputs', () => {
    const partition = [
      ...aiToolResultContract.venusParsedEnvelopeTypes,
      ...aiToolResultContract.venusIgnoredRenderableEnvelopeTypes,
    ]
    expect(new Set(partition)).toEqual(new Set(aiToolResultContract.renderableEnvelopeTypes))
    expect(aiToolResultContract.venusIgnoredRenderableEnvelopeTypes).toEqual([
      'client_owner_invite_request',
      'valuation_method_selection_request',
      'deal_readiness',
      'start_playbook_request',
      // BET-500 value-up cards: Titan emits these for the owner/advisor value
      // curve (a Mercury surface); the Venus calculator has no workspace to
      // render them, so it intentionally ignores the envelopes.
      'stage_advance_request',
      'gap_fix_request',
      'content_improve_request',
    ])
  })

  it('parses buyer-ready envelopes instead of dropping the IM/data-room workflow', () => {
    const result = parseAIChatToolResults([
      {
        type: 'buyer_ready_package_status',
        data: {
          status: 'available',
          card: {
            entity_id: 'entity-1',
            package_status: 'draft',
            release_status: 'nda_required',
            included_artifact_count: 7,
            required_artifact_count: 10,
            missing_required_artifact_types: ['legal_readiness'],
            open_input_count: 2,
            checklist: {
              overall_status: 'needs_attention',
              green_count: 8,
              yellow_count: 3,
              red_count: 1,
            },
          },
        },
      },
      {
        type: 'buyer_ready_package_generation_request',
        data: {
          status: 'pending_approval',
          request: {
            report_id: 'report-1',
            reason: 'Generate the first IM',
            region_label: 'Flanders',
            country_code: 'BE',
            submit_path: '/api/valuations/reports/report-1/buyer-ready-package',
            result_summary: {
              business_name: 'Acme BV',
              business_type: 'Software',
              valuation_method: 'dcf',
              currency: 'EUR',
              midpoint: 1200000,
            },
          },
        },
      },
      {
        type: 'im_regenerate_request',
        data: {
          status: 'pending_approval',
          request: {
            section_key: 'financial_overview',
            current_confidence: 'low',
            reason: 'Numbers changed after import review',
            submit_path: '/api/buyer-ready/im/regen',
          },
        },
      },
      {
        type: 'package_publish_request',
        data: {
          status: 'blocked',
          reason: 'missing_required_artifacts',
          request: {
            missing_artifact_types: ['dd_checklist'],
            not_ready_artifacts: [
              {
                artifact_type: 'legal_readiness',
                status: 'review',
                reason: 'Counsel review required',
              },
            ],
            legal_release_status: 'lawyer_review_required',
          },
        },
      },
    ])

    expect(result.buyerReadyCards).toEqual([
      expect.objectContaining({
        kind: 'buyer_package_status',
        entityId: 'entity-1',
        includedArtifactCount: 7,
        missingRequiredArtifactTypes: ['legal_readiness'],
        checklist: expect.objectContaining({ redCount: 1 }),
      }),
      expect.objectContaining({
        kind: 'buyer_package_generation',
        status: 'pending_approval',
        reportId: 'report-1',
        regionLabel: 'Flanders',
        resultSummary: expect.objectContaining({
          businessName: 'Acme BV',
          midpoint: 1200000,
        }),
      }),
      expect.objectContaining({
        kind: 'im_regenerate',
        sectionKey: 'financial_overview',
        currentConfidence: 'low',
      }),
      expect.objectContaining({
        kind: 'package_publish',
        status: 'blocked',
        missingArtifactTypes: ['dd_checklist'],
        legalReleaseStatus: 'lawyer_review_required',
      }),
    ])
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

  it('fans out batch suggestions into individual normalisation cards', () => {
    const result = parseAIChatToolResults([
      {
        type: 'normalization_suggestion_batch',
        data: {
          status: 'pending_approval',
          suggestions: [
            { category: 'rent', amount: 12000 },
            { category: 'salary', amount: 45000 },
          ],
        },
      },
    ])
    expect(result.normalisationSuggestions).toEqual([
      { category: 'rent', amount: 12000 },
      { category: 'salary', amount: 45000 },
    ])
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
    expect((result.sellabilityRunRequests[0] as { currentScore?: unknown }).currentScore).toBeNull()
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
