// @vitest-environment node

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
import aiToolResultContract from '../../../../../../tests/contracts/ai-tool-result-contract.json'
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
    // Advisor-only widgets (e.g. add_client_widget) are Mercury-dock surfaces — Venus
    // deliberately ignores them so seller chat never renders advisor tooling.
    expect(aiToolResultContract.venusIgnoredRenderableEnvelopeTypes).toEqual([
      'add_client_widget',
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

// ---------------------------------------------------------------------
// agentic action envelopes
// ---------------------------------------------------------------------

describe('agentic action envelopes', () => {
  it('parses owner-profile answer proposals', () => {
    const result = parseAIChatToolResults([
      {
        type: 'owner_profile_answer_request',
        data: {
          update: {
            field: 'key_man_dependency',
            value: 'low',
            label: 'Key person dependency',
            reason: 'Documented management team.',
            complete: true,
            accountantCustomerId: 'client-1',
          },
        },
      },
    ])

    expect(result.ownerProfileAnswerRequests).toEqual([
      {
        field: 'key_man_dependency',
        value: 'low',
        label: 'Key person dependency',
        reason: 'Documented management team.',
        complete: true,
        accountantCustomerId: 'client-1',
      },
    ])
  })

  it('parses integration, credential, upload, and choice proposals', () => {
    const result = parseAIChatToolResults([
      {
        type: 'integration_connect_request',
        data: {
          status: 'pending_approval',
          request: {
            provider: 'silverfin',
            auth_mode: 'oauth',
            reason: 'Pull trial balance data.',
            target_context: 'client-1',
          },
          message: 'Connect Silverfin.',
        },
      },
      {
        type: 'secure_credential_request',
        data: {
          status: 'pending_approval',
          request: {
            provider: 'exact',
            fields: [
              { key: 'api_key', label: 'API key', masked: true, required: true },
              { key: '', label: 'Malformed' },
            ],
            submit_path: '/api/integrations/accounting/exact/credentials',
          },
        },
      },
      {
        type: 'csv_upload_request',
        data: {
          status: 'pending_approval',
          request: {
            mode: 'single_client_trial_balance',
            label: 'Upload trial balance',
            expected_columns: ['account', 'amount'],
            max_size_bytes: 5242880,
            accept: '.csv',
          },
        },
      },
      {
        type: 'multi_select_request',
        data: {
          status: 'pending_approval',
          request: {
            title: 'Select methods',
            options: [
              { value: 'ebitda', label: 'EBITDA' },
              { value: 'sde', label: 'SDE' },
            ],
            min_selections: 1,
            max_selections: 2,
            preselected: ['ebitda'],
          },
        },
      },
      {
        type: 'single_select_request',
        data: {
          status: 'pending_approval',
          request: {
            title: 'Choose source',
            options: [
              { value: 'yuki', label: 'Yuki' },
              { value: 'csv', label: 'CSV' },
            ],
            preselected: 'csv',
          },
        },
      },
    ])

    expect(result.integrationConnectRequests).toEqual([
      {
        status: 'pending_approval',
        provider: 'silverfin',
        authMode: 'oauth',
        reason: 'Pull trial balance data.',
        targetContext: 'client-1',
        message: 'Connect Silverfin.',
      },
    ])
    expect(result.secureCredentialRequests[0]).toMatchObject({
      status: 'pending_approval',
      provider: 'exact',
      submitPath: '/api/integrations/accounting/exact/credentials',
      fields: [{ key: 'api_key', label: 'API key', masked: true, required: true }],
    })
    expect(result.csvUploadRequests[0]).toMatchObject({
      status: 'pending_approval',
      mode: 'single_client_trial_balance',
      expectedColumns: ['account', 'amount'],
      maxSizeBytes: 5242880,
      accept: '.csv',
    })
    expect(result.multiSelectRequests[0]).toMatchObject({
      status: 'pending_approval',
      title: 'Select methods',
      minSelections: 1,
      maxSelections: 2,
      preselected: ['ebitda'],
    })
    expect(result.singleSelectRequests[0]).toMatchObject({
      status: 'pending_approval',
      title: 'Choose source',
      preselected: 'csv',
    })
  })

  it('parses Mercury parity proposals for sync, reminders, listing visibility, and share tokens', () => {
    const result = parseAIChatToolResults([
      {
        type: 'integration_sync_request',
        data: {
          status: 'pending_approval',
          request: {
            provider: 'exact',
            scope: 'client_scope',
            client_id: 'client-1',
            reason: 'Fresh 2025 data is available.',
          },
          message: 'Sync Exact before running valuation.',
        },
      },
      {
        type: 'owner_reminder_request',
        data: {
          status: 'pending_approval',
          request: {
            client_id: 'client-1',
            business_name: 'Acme NV',
            customer_email: 'owner@acme.test',
            custom_message: 'Could you complete the owner profile?',
            reason: 'Owner profile is incomplete.',
          },
        },
      },
      {
        type: 'owner_invite_accountant_request',
        data: {
          status: 'pending_approval',
          request: {
            accountant_email: 'advisor@example.com',
            custom_message: 'Please review the books.',
            reason: 'The owner wants their accountant involved.',
          },
        },
      },
      {
        type: 'listing_visibility_request',
        data: {
          status: 'pending_approval',
          request: {
            listing_id: 'listing-1',
            visibility: 'private',
            business_name: 'Acme listing',
            reason: 'Keep it invite-only for now.',
          },
        },
      },
      {
        type: 'share_token_request',
        data: {
          status: 'pending_approval',
          request: {
            listing_id: 'listing-1',
            expires_in_days: 14,
            max_uses: 1,
            label: 'For Acme Capital',
            business_name: 'Acme listing',
            reason: 'One buyer needs a private link.',
          },
        },
      },
      {
        type: 'share_token_revoke_request',
        data: {
          status: 'pending_approval',
          request: {
            listing_id: 'listing-1',
            token_id: 'token-1',
            token_hint: 'up_1234',
            token_label: 'For Acme Capital',
            business_name: 'Acme listing',
            reason: 'The buyer dropped out.',
          },
        },
      },
      {
        type: 'valuation_method_preference_request',
        data: {
          status: 'pending_approval',
          request: {
            client_id: 'client-1',
            method: 'dcf',
            business_name: 'Acme NV',
            reason: 'DCF should be the headline lens for the next bulk run.',
          },
        },
      },
      {
        type: 'acknowledge_warning_request',
        data: {
          status: 'pending_approval',
          request: {
            code: 'cap_breach:2024:owner_salary',
            kind: 'cap_breach',
            summary: 'Owner salary normalization exceeds cap',
            reason: 'Founder confirmed below-market comp.',
            client_id: 'client-1',
            report_id: 'report-1',
          },
        },
      },
    ])

    expect(result.integrationSyncRequests[0]).toMatchObject({
      status: 'pending_approval',
      provider: 'exact',
      scope: 'client_scope',
      clientId: 'client-1',
    })
    expect(result.ownerReminderRequests[0]).toMatchObject({
      status: 'pending_approval',
      clientId: 'client-1',
      businessName: 'Acme NV',
      customerEmail: 'owner@acme.test',
    })
    expect(result.ownerInviteAccountantRequests[0]).toMatchObject({
      status: 'pending_approval',
      accountantEmail: 'advisor@example.com',
      customMessage: 'Please review the books.',
    })
    expect(result.listingVisibilityRequests[0]).toMatchObject({
      status: 'pending_approval',
      listingId: 'listing-1',
      visibility: 'private',
    })
    expect(result.shareTokenRequests[0]).toMatchObject({
      status: 'pending_approval',
      listingId: 'listing-1',
      expiresInDays: 14,
      maxUses: 1,
      label: 'For Acme Capital',
    })
    expect(result.shareTokenRevokeRequests[0]).toMatchObject({
      status: 'pending_approval',
      listingId: 'listing-1',
      tokenId: 'token-1',
      tokenHint: 'up_1234',
    })
    expect(result.valuationMethodPreferenceRequests[0]).toMatchObject({
      status: 'pending_approval',
      clientId: 'client-1',
      method: 'dcf',
      businessName: 'Acme NV',
    })
    expect(result.acknowledgeWarningRequests[0]).toMatchObject({
      status: 'pending_approval',
      code: 'cap_breach:2024:owner_salary',
      warningKind: 'cap_breach',
      clientId: 'client-1',
      reportId: 'report-1',
    })
  })

  it('parses advisor workflow proposals and blocked states', () => {
    const result = parseAIChatToolResults([
      {
        type: 'client_create_request',
        data: {
          status: 'pending_approval',
          request: {
            business_name: 'Acme NV',
            customer_email: 'owner@acme.test',
            company_number: 'BE0123456789',
            industry: 'Software',
            location: 'Antwerp',
            notes: 'Imported from KBO.',
          },
          message: 'Ready to add client.',
        },
      },
      {
        type: 'valuation_session_request',
        data: {
          status: 'auto_approved',
          request: {
            client_id: 'client-1',
            business_name: 'Acme NV',
            customer_email: 'owner@acme.test',
            has_business_card: true,
            latest_valuation_id: 'valuation-1',
            has_synced_financials: true,
            stp_status: 'ready',
          },
        },
      },
      {
        type: 'import_review_request',
        data: {
          status: 'pending_approval',
          request: {
            client_id: 'client-1',
            business_name: 'Acme NV',
            accounting_sources: [{ provider: 'yuki', client_key: 'admin-1' }],
            actionable_flag_count: 2,
            top_flags: [{ year: '2025', code: 'UNMAPPED_LEDGER', severity: 'error' }],
          },
        },
      },
      {
        type: 'client_create_request',
        data: {
          status: 'pending_approval',
          request: {
            business_name: 'Name Only NV',
            company_number: ' ',
          },
          message: 'Malformed stale card.',
        },
      },
      {
        type: 'client_create_request',
        data: {
          status: 'blocked',
          reason: 'missing_business_name',
          message: 'Tell me which business to add.',
        },
      },
    ])

    expect(result.clientCreateRequests).toEqual([
      {
        status: 'pending_approval',
        businessName: 'Acme NV',
        customerEmail: 'owner@acme.test',
        companyNumber: 'BE0123456789',
        industry: 'Software',
        location: 'Antwerp',
        notes: 'Imported from KBO.',
        message: 'Ready to add client.',
      },
      {
        status: 'blocked',
        reason: 'missing_business_name',
        message: 'Tell me which business to add.',
      },
    ])
    expect(result.valuationSessionRequests).toEqual([
      {
        status: 'auto_approved',
        clientId: 'client-1',
        businessName: 'Acme NV',
        customerEmail: 'owner@acme.test',
        hasBusinessCard: true,
        latestValuationId: 'valuation-1',
        hasSyncedFinancials: true,
        stpStatus: 'ready',
      },
    ])
    expect(result.importReviewRequests).toMatchObject([
      {
        status: 'pending_approval',
        clientId: 'client-1',
        businessName: 'Acme NV',
        accountingSources: [{ provider: 'yuki', clientKey: 'admin-1', lastSyncAt: null }],
        actionableFlagCount: 2,
        topFlags: [
          { year: '2025', code: 'UNMAPPED_LEDGER', severity: 'error', field: null, message: null },
        ],
      },
    ])
  })
})

// ---------------------------------------------------------------------
// belgian_company_bootstrap
// ---------------------------------------------------------------------

describe('belgian_company_bootstrap', () => {
  it('parses public Belgian company bootstrap cards', () => {
    const result = parseAIChatToolResults([
      {
        type: 'belgian_company_bootstrap',
        data: {
          status: 'ok',
          identity: {
            legal_name: 'Decostere NV',
            legal_form: 'NV',
            kbo_number: 'BE0400.378.485',
            address: 'Markt 1',
            city: 'Kortrijk',
            postal_code: '8500',
            nace_code: '22220',
            nace_description: 'Plastic packaging manufacturing',
            foundation_date: '1986-02-01',
            is_active: true,
          },
          benchmark: {
            status: 'matched',
            business_type_title: 'Manufacturing',
            ev_ebitda_median: 5.6,
            confidence: 'medium',
          },
          filing_summary: {
            status: 'ok',
            source: 'nbb_cbso',
            filing_year: 2024,
            years_available: 3,
            revenue: 4_500_000,
            ebitda: 620_000,
            data_health_message: 'Official filing data available.',
          },
          valuation_preview: {
            status: 'ok',
            method: 'ev_ebitda_public',
            ebitda_used: 620_000,
            ebitda_year: 2024,
            ev_mid: 3_472_000,
            equity_mid: 3_100_000,
          },
          message: 'Public data found.',
        },
      },
    ])

    expect(result.belgianCompanyBootstraps).toEqual([
      {
        status: 'ok',
        reason: undefined,
        message: 'Public data found.',
        identity: {
          legalName: 'Decostere NV',
          legalForm: 'NV',
          kboNumber: 'BE0400.378.485',
          address: 'Markt 1',
          city: 'Kortrijk',
          postalCode: '8500',
          naceCode: '22220',
          naceDescription: 'Plastic packaging manufacturing',
          foundationDate: '1986-02-01',
          isActive: true,
        },
        benchmark: {
          status: 'matched',
          businessTypeTitle: 'Manufacturing',
          evEbitdaMedian: 5.6,
          confidence: 'medium',
        },
        filingSummary: {
          status: 'ok',
          source: 'nbb_cbso',
          filingYear: 2024,
          yearsAvailable: 3,
          revenue: 4_500_000,
          ebitda: 620_000,
          dataHealthMessage: 'Official filing data available.',
        },
        valuationPreview: {
          status: 'ok',
          method: 'ev_ebitda_public',
          ebitdaUsed: 620_000,
          ebitdaYear: 2024,
          evMid: 3_472_000,
          equityMid: 3_100_000,
        },
      },
    ])
  })

  it('parses failed bootstrap cards so the drawer can show a blocked state', () => {
    const result = parseAIChatToolResults([
      {
        type: 'belgian_company_bootstrap',
        data: {
          status: 'failed',
          reason: 'upstream_unavailable',
          message: 'Belgian company enrichment is temporarily unavailable.',
        },
      },
    ])

    expect(result.belgianCompanyBootstraps).toEqual([
      {
        status: 'failed',
        reason: 'upstream_unavailable',
        message: 'Belgian company enrichment is temporarily unavailable.',
        identity: null,
        benchmark: null,
        filingSummary: null,
        valuationPreview: null,
      },
    ])
  })

  it('drops malformed bootstrap statuses', () => {
    const result = parseAIChatToolResults([
      {
        type: 'belgian_company_bootstrap',
        data: { status: 'unknown_status', identity: { legal_name: 'Decostere NV' } },
      },
    ])

    expect(result.belgianCompanyBootstraps).toEqual([])
  })
})

// ---------------------------------------------------------------------
// client_data_readiness
// ---------------------------------------------------------------------

describe('client_data_readiness', () => {
  it('parses Hermes import-review readiness into a read-only preview', () => {
    const result = parseAIChatToolResults([
      {
        type: 'client_data_readiness',
        data: {
          status: 'needs_import_review',
          client_id: 'client-123',
          business_name: 'Acme NV',
          has_business_card: true,
          has_synced_financials: true,
          has_financial_data: true,
          financial_synced_at: '2026-05-02T12:00:00Z',
          stp_status: 'pending',
          computed_stp_status: 'needs_review',
          latest_valuation_id: 'valuation-1',
          accounting_sources: [
            {
              provider: 'yuki',
              client_key: 'admin-1',
              is_primary_for_valuation: true,
              last_sync_at: '2026-05-02T12:00:00Z',
            },
          ],
          import_quality_summary: {
            years: ['2024'],
            min_confidence: 0.62,
            error_count: 1,
            warning_count: 2,
            info_count: 0,
            actionable_flag_count: 3,
            top_flags: [
              {
                year: '2024',
                field: 'ebitda',
                code: 'UNMAPPED_LEDGER_LINES',
                severity: 'error',
                message: 'Unmapped ledger lines affect EBITDA.',
              },
            ],
          },
          recommended_next_action: 'Open Hermes import review before valuation.',
          recommended_next_tool: 'open_import_review',
          recommended_next_route: '/advisor/import-review?clientId=client-123',
        },
      },
    ])

    expect(result.clientDataReadinessPreviews).toEqual([
      {
        status: 'needs_import_review',
        clientId: 'client-123',
        businessName: 'Acme NV',
        hasBusinessCard: true,
        hasSyncedFinancials: true,
        hasFinancialData: true,
        financialSyncedAt: '2026-05-02T12:00:00Z',
        stpStatus: 'pending',
        computedStpStatus: 'needs_review',
        latestValuationId: 'valuation-1',
        accountingSources: [
          {
            provider: 'yuki',
            clientKey: 'admin-1',
            isPrimaryForValuation: true,
            lastSyncAt: '2026-05-02T12:00:00Z',
          },
        ],
        importQualitySummary: {
          years: ['2024'],
          minConfidence: 0.62,
          errorCount: 1,
          warningCount: 2,
          infoCount: 0,
          actionableFlagCount: 3,
          topFlags: [
            {
              year: '2024',
              field: 'ebitda',
              code: 'UNMAPPED_LEDGER_LINES',
              severity: 'error',
              message: 'Unmapped ledger lines affect EBITDA.',
            },
          ],
        },
        recommendedNextAction: 'Open Hermes import review before valuation.',
        recommendedNextTool: 'open_import_review',
        recommendedNextRoute: '/advisor/import-review?clientId=client-123',
      },
    ])
  })

  it('drops malformed client_data_readiness envelopes', () => {
    const result = parseAIChatToolResults([
      { type: 'client_data_readiness', data: { client_id: 'client-123' } },
      { type: 'client_data_readiness', data: null },
    ])

    expect(result.clientDataReadinessPreviews).toEqual([])
  })
})

// ---------------------------------------------------------------------
// method_readiness
// ---------------------------------------------------------------------

describe('method_readiness', () => {
  it('parses read-only valuation method readiness cards', () => {
    const result = parseAIChatToolResults([
      {
        type: 'method_readiness',
        data: {
          status: 'ok',
          report_id: 'rep-uuid',
          business_name: 'Acme',
          readiness_source: 'hermes_raw',
          ready_methods: ['ebitda_multiple', 'sde_multiple'],
          blocked_methods: ['dcf'],
          message: 'Two methods can run today.',
        },
      },
    ])

    expect(result.methodReadinessPreviews).toEqual([
      {
        status: 'ok',
        reportId: 'rep-uuid',
        businessName: 'Acme',
        readinessSource: 'hermes_raw',
        readyMethods: ['ebitda_multiple', 'sde_multiple'],
        blockedMethods: ['dcf'],
        message: 'Two methods can run today.',
      },
    ])
  })

  it('parses non-ok method readiness statuses as blocked cards', () => {
    const result = parseAIChatToolResults([
      {
        type: 'method_readiness',
        data: {
          status: 'pipeline_not_run',
          message: 'Import financials first.',
          ready_methods: [],
          blocked_methods: ['ebitda_multiple', 'dcf'],
        },
      },
    ])

    expect(result.methodReadinessPreviews).toEqual([
      {
        status: 'blocked',
        businessName: null,
        readinessSource: null,
        readyMethods: [],
        blockedMethods: ['ebitda_multiple', 'dcf'],
        reason: 'pipeline_not_run',
        message: 'Import financials first.',
      },
    ])
  })
})

// ---------------------------------------------------------------------
// listing_preview
// ---------------------------------------------------------------------

describe('listing_preview', () => {
  it('parses read-only anonymized listing previews', () => {
    const result = parseAIChatToolResults([
      {
        type: 'listing_preview',
        data: {
          status: 'ok',
          report_id: 'rep-uuid',
          source_business_name: 'Acme',
          missing_fields: ['province'],
          next_action_hint: 'Review buyer profiles.',
          preview: {
            anonymized_title: 'Profitable software services firm',
            business_type: 'Services',
            sector: 'Technology',
            industry: 'B2B Software',
            region: 'Flanders',
            province: 'Antwerp',
            year_commenced: 2008,
            employee_range: '11-50',
            revenue_range: '€2M-€5M',
            equity_stake: 'Majority',
            ownership_structure: 'Founder-owned',
            owner_managers_count: 1,
            status: 'draft',
            featured: false,
            nda_required: true,
            view_count: 0,
            has_verified_valuation: true,
          },
          message: 'Listing preview is ready.',
        },
      },
    ])

    expect(result.listingPreviews).toEqual([
      {
        status: 'ok',
        reportId: 'rep-uuid',
        sourceBusinessName: 'Acme',
        missingFields: ['province'],
        nextActionHint: 'Review buyer profiles.',
        preview: {
          title: 'Profitable software services firm',
          businessType: 'Services',
          sector: 'Technology',
          industry: 'B2B Software',
          region: 'Flanders',
          province: 'Antwerp',
          yearCommenced: 2008,
          employeeRange: '11-50',
          revenueRange: '€2M-€5M',
          equityStake: 'Majority',
          ownershipStructure: 'Founder-owned',
          ownerManagersCount: 1,
          status: 'draft',
          featured: false,
          ndaRequired: true,
          viewCount: 0,
          hasVerifiedValuation: true,
        },
        message: 'Listing preview is ready.',
      },
    ])
  })

  it('parses non-ok listing preview statuses as blocked cards', () => {
    const result = parseAIChatToolResults([
      {
        type: 'listing_preview',
        data: {
          status: 'preview_failed',
          report_id: 'rep-uuid',
          message: 'Could not anonymize listing yet.',
        },
      },
    ])

    expect(result.listingPreviews).toEqual([
      {
        status: 'blocked',
        reportId: 'rep-uuid',
        reason: 'preview_failed',
        message: 'Could not anonymize listing yet.',
      },
    ])
  })
})

// ---------------------------------------------------------------------
// listing_create_request
// ---------------------------------------------------------------------

describe('listing_create_request', () => {
  it('parses pending_approval with report, client, visibility, and valuation summary', () => {
    const valuation_summary = {
      business_name: 'Acme',
      business_type: 'Software',
      industry: 'B2B SaaS',
      currency: 'EUR',
      midpoint: '1000000',
      min: '800000',
      max: '1200000',
    }
    const result = parseAIChatToolResults([
      {
        type: 'listing_create_request',
        data: {
          status: 'pending_approval',
          request: {
            report_id: 'rep-uuid',
            accountant_customer_id: 'client-uuid',
            visibility: 'private',
            valuation_summary,
            note: 'Ready for advisor review',
          },
          message: 'Ready to create listing',
        },
      },
    ])

    expect(result.listingCreateRequests).toEqual([
      {
        status: 'pending_approval',
        reportId: 'rep-uuid',
        accountantCustomerId: 'client-uuid',
        visibility: 'private',
        valuationSummary: valuation_summary,
        note: 'Ready for advisor review',
        message: 'Ready to create listing',
      },
    ])
  })

  it('parses blocked branch', () => {
    const result = parseAIChatToolResults([
      {
        type: 'listing_create_request',
        data: {
          status: 'blocked',
          reason: 'no_valuation_yet',
          message: 'Generate a valuation first',
        },
      },
    ])

    expect(result.listingCreateRequests).toEqual([
      {
        status: 'blocked',
        reason: 'no_valuation_yet',
        message: 'Generate a valuation first',
      },
    ])
  })
})

// ---------------------------------------------------------------------
// buyer_profile_preview
// ---------------------------------------------------------------------

describe('buyer_profile_preview', () => {
  it('parses read-only buyer profile previews', () => {
    const result = parseAIChatToolResults([
      {
        type: 'buyer_profile_preview',
        data: {
          status: 'ok',
          report_id: 'rep-uuid',
          source_business_name: 'Acme',
          listing_readiness: {
            status: 'needs_review',
            missing_fields: ['country'],
          },
          buyer_segments: [
            {
              id: 'strategic_acquirer',
              label: 'Strategic acquirer',
              fit_score: 91,
              recommended_angle: 'Lead with strategic fit.',
            },
          ],
          message: 'Likely buyer audiences, not real matches.',
        },
      },
    ])

    expect(result.buyerProfilePreviews).toEqual([
      {
        status: 'ok',
        reportId: 'rep-uuid',
        sourceBusinessName: 'Acme',
        listingReadiness: {
          status: 'needs_review',
          missingFields: ['country'],
        },
        buyerSegments: [
          {
            id: 'strategic_acquirer',
            label: 'Strategic acquirer',
            fitScore: 91,
            recommendedAngle: 'Lead with strategic fit.',
          },
        ],
        message: 'Likely buyer audiences, not real matches.',
      },
    ])
  })

  it('parses blocked buyer profile previews', () => {
    const result = parseAIChatToolResults([
      {
        type: 'buyer_profile_preview',
        data: {
          status: 'blocked',
          reason: 'valuation_incomplete',
          message: 'Run the valuation first.',
        },
      },
    ])

    expect(result.buyerProfilePreviews).toEqual([
      {
        status: 'blocked',
        reason: 'valuation_incomplete',
        message: 'Run the valuation first.',
      },
    ])
  })
})

// ---------------------------------------------------------------------
// business_type_search_results
// ---------------------------------------------------------------------

describe('business_type_search_results', () => {
  it('parses business-type discovery cards', () => {
    const result = parseAIChatToolResults([
      {
        type: 'business_type_search_results',
        data: {
          status: 'ok',
          query: 'software',
          total_found: 1,
          results: [
            {
              id: 'saas-company',
              title: 'SaaS company',
              description: 'Recurring software revenue.',
              category: 'technology',
              industry: 'Software',
              sector: 'Technology',
              primary_model: 'arr_multiple',
              preferred_multiples: ['ARR', 'EV/Revenue'],
              valuation_benchmarks: {
                status: 'resolver_required',
                message: 'Use get_sector_benchmark before citing multiples.',
              },
            },
          ],
        },
      },
    ])

    expect(result.businessTypeSearchResults).toEqual([
      {
        status: 'ok',
        query: 'software',
        totalFound: 1,
        results: [
          {
            id: 'saas-company',
            title: 'SaaS company',
            description: 'Recurring software revenue.',
            category: 'technology',
            industry: 'Software',
            sector: 'Technology',
            primaryModel: 'arr_multiple',
            preferredMultiples: ['ARR', 'EV/Revenue'],
            benchmarkStatus: 'resolver_required',
            benchmarkMessage: 'Use get_sector_benchmark before citing multiples.',
          },
        ],
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
      {
        type: 'belgian_company_bootstrap',
        data: { status: 'ok', identity: { legal_name: 'Acme NV' } },
      },
      {
        type: 'client_data_readiness',
        data: { status: 'needs_import_review', client_id: 'client-1' },
      },
      {
        type: 'method_readiness',
        data: {
          status: 'ok',
          ready_methods: ['ebitda_multiple'],
          blocked_methods: ['dcf'],
        },
      },
      {
        type: 'listing_preview',
        data: { status: 'ok', preview: { anonymized_title: 'Acme listing' } },
      },
      {
        type: 'listing_create_request',
        data: { status: 'pending_approval', request: { report_id: 'r1' } },
      },
    ])
    expect(result.normalisationSuggestions).toHaveLength(1)
    expect(result.fieldUpdates).toHaveLength(1)
    expect(result.valuationRunRequests).toHaveLength(1)
    expect(result.reportGenerationRequests).toHaveLength(1)
    expect(result.sellabilityRunRequests).toHaveLength(1)
    expect(result.belgianCompanyBootstraps).toHaveLength(1)
    expect(result.clientDataReadinessPreviews).toHaveLength(1)
    expect(result.methodReadinessPreviews).toHaveLength(1)
    expect(result.listingPreviews).toHaveLength(1)
    expect(result.listingCreateRequests).toHaveLength(1)
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
      'advisor_fees'
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
      cb
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
    dispatchAIChatChunk({ type: 'text', conversationId: 'cv-from-text', content: 'hi' }, state, cb)
    expect(state.resolvedConversationId).toBe('cv-from-text')
  })

  it('does NOT overwrite captured conversationId when subsequent text chunk has empty conversationId', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    dispatchAIChatChunk({ type: 'text', conversationId: 'cv-first', content: 'hi' }, state, cb)
    dispatchAIChatChunk({ type: 'text', conversationId: '', content: 'more' }, state, cb)
    expect(state.resolvedConversationId).toBe('cv-first')
  })
})

describe('dispatchAIChatChunk — tool chunks', () => {
  it('fires onToolStart with toolName', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk(
      { type: 'tool_start', toolName: 'run_valuation' },
      makeChunkDispatchState(),
      cb
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
      cb
    )
    expect(cb.onToolResult).toHaveBeenCalledWith('suggest_normalization', result)
  })

  it('passes undefined toolResult through when missing (consumer handles)', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk(
      { type: 'tool_result', toolName: 'noop_tool' },
      makeChunkDispatchState(),
      cb
    )
    expect(cb.onToolResult).toHaveBeenCalledWith('noop_tool', undefined)
  })
})

describe('dispatchAIChatChunk — terminal chunks', () => {
  it('silently absorbs keepalive chunks without callbacks or terminal state', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()

    const nextState = dispatchAIChatChunk({ type: '_keepalive' }, state, cb)

    expect(nextState).toBe(state)
    expect(state.doneReceived).toBe(false)
    expect(cb.onText).not.toHaveBeenCalled()
    expect(cb.onToolStart).not.toHaveBeenCalled()
    expect(cb.onToolResult).not.toHaveBeenCalled()
    expect(cb.onDone).not.toHaveBeenCalled()
    expect(cb.onError).not.toHaveBeenCalled()
  })

  it('fires onDone with chunk.conversationId when present (preferred over captured)', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    state.resolvedConversationId = 'cv-from-earlier-text'
    dispatchAIChatChunk({ type: 'done', conversationId: 'cv-from-done' }, state, cb)
    expect(cb.onDone).toHaveBeenCalledWith('cv-from-done', { incomplete: false })
    expect(state.doneReceived).toBe(true)
  })

  it('falls back to captured conversationId when done chunk has none', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    state.resolvedConversationId = 'cv-from-earlier-text'
    dispatchAIChatChunk({ type: 'done' }, state, cb)
    expect(cb.onDone).toHaveBeenCalledWith('cv-from-earlier-text', { incomplete: false })
  })

  it('passes undefined to onDone when neither chunk nor state has a conversationId', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk({ type: 'done' }, makeChunkDispatchState(), cb)
    expect(cb.onDone).toHaveBeenCalledWith(undefined, { incomplete: false })
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
    dispatchAIChatChunk({ type: 'text', conversationId: 'cv-x', content: 'streaming' }, state, cb)
    dispatchAIChatChunk({ type: 'text', content: 'more text' }, state, cb)
    dispatchAIChatChunk({ type: 'done' }, state, cb)

    expect(cb.onDone).toHaveBeenCalledWith('cv-x', { incomplete: false })
  })

  it("handles missing optional callbacks gracefully (consumer didn't wire them)", () => {
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
