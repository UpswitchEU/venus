// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/components/calculator'
import {
  addIdsToManualChatToolCards,
  appendManualChatToolCardsToMessages,
  applyManualChatSellabilityComputedScore,
  markManualChatProposalDecision,
  parseManualChatStreamToolResult,
} from './manualChatToolCards'

function idFactory() {
  let next = 0
  return () => `id-${++next}`
}

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: '',
    timestamp: new Date('2026-05-15T10:00:00.000Z'),
    ...overrides,
  }
}

describe('manualChatToolCards', () => {
  it('parses streaming field updates through the shared AI tool parser', () => {
    const cards = parseManualChatStreamToolResult(
      'update_field_value',
      {
        update: {
          field: 'revenue',
          value: 1_000_000,
          label: 'Revenue',
          confidence: 'high',
        },
      },
      idFactory()
    )

    expect(cards?.fieldUpdates).toEqual([
      {
        field: 'revenue',
        value: 1_000_000,
        label: 'Revenue',
        source: 'ai',
        confidence: 'high',
      },
    ])
  })

  it('parses streaming proposal-card tool results and assigns ids', () => {
    const createId = idFactory()

    expect(
      parseManualChatStreamToolResult(
        'suggest_normalization',
        {
          suggestion: {
            code: '620',
            description: 'Owner salary',
            category: 'salary',
            amount: 50_000,
            reason: 'Market add-back',
          },
        },
        createId
      )?.normalisationSuggestions?.[0]
    ).toMatchObject({ id: 'id-1', status: 'pending', multiple: 5.2 })

    expect(
      parseManualChatStreamToolResult(
        'run_valuation',
        {
          status: 'pending_approval',
          request: {
            report_id: 'report-1',
            methods: ['dcf'],
            estimated_credits: 1,
            inputs_summary: { business_name: 'Acme' },
          },
          message: 'Ready?',
        },
        createId
      )?.valuationRunRequests?.[0]
    ).toMatchObject({
      id: 'id-2',
      status: 'pending_approval',
      reportId: 'report-1',
      methods: ['dcf'],
      estimatedCredits: 1,
      message: 'Ready?',
    })

    expect(
      parseManualChatStreamToolResult(
        'generate_report',
        { status: 'blocked', reason: 'missing_result', message: 'Calculate first' },
        createId
      )?.reportGenerationRequests?.[0]
    ).toMatchObject({
      id: 'id-3',
      status: 'blocked',
      reason: 'missing_result',
      message: 'Calculate first',
    })

    expect(
      parseManualChatStreamToolResult(
        'run_sellability',
        {
          status: 'pending_approval',
          request: { estimated_credits: 0, current_score: null },
        },
        createId
      )?.sellabilityRunRequests?.[0]
    ).toMatchObject({
      id: 'id-4',
      status: 'pending_approval',
      estimatedCredits: 0,
      currentScore: null,
    })

    expect(
      parseManualChatStreamToolResult(
        'bootstrap_belgian_company',
        {
          status: 'ok',
          identity: {
            legal_name: 'Decostere NV',
            kbo_number: 'BE0400.378.485',
            city: 'Kortrijk',
            is_active: true,
          },
          filing_summary: {
            filing_year: 2024,
            revenue: 4_500_000,
            ebitda: 620_000,
          },
          valuation_preview: {
            equity_mid: 3_100_000,
          },
        },
        createId
      )?.belgianCompanyBootstraps?.[0]
    ).toMatchObject({
      id: 'id-5',
      status: 'ok',
      identity: {
        legalName: 'Decostere NV',
        kboNumber: 'BE0400.378.485',
        city: 'Kortrijk',
        isActive: true,
      },
      filingSummary: {
        filingYear: 2024,
        revenue: 4_500_000,
        ebitda: 620_000,
      },
      valuationPreview: {
        equityMid: 3_100_000,
      },
    })

    expect(
      parseManualChatStreamToolResult(
        'get_method_readiness',
        {
          status: 'ok',
          report_id: 'report-1',
          business_name: 'Decostere NV',
          readiness_source: 'hermes_raw',
          ready_methods: ['ebitda_multiple', 'sde_multiple'],
          blocked_methods: ['dcf'],
        },
        createId
      )?.methodReadinessPreviews?.[0]
    ).toMatchObject({
      id: 'id-6',
      status: 'ok',
      reportId: 'report-1',
      businessName: 'Decostere NV',
      readinessSource: 'hermes_raw',
      readyMethods: ['ebitda_multiple', 'sde_multiple'],
      blockedMethods: ['dcf'],
    })

    expect(
      parseManualChatStreamToolResult(
        'get_listing_preview',
        {
          status: 'ok',
          report_id: 'report-1',
          source_business_name: 'Acme',
          preview: {
            anonymized_title: 'Profitable services firm',
            sector: 'Technology',
            region: 'Flanders',
            revenue_range: '€2M-€5M',
            has_verified_valuation: true,
          },
        },
        createId
      )?.listingPreviews?.[0]
    ).toMatchObject({
      id: 'id-7',
      status: 'ok',
      reportId: 'report-1',
      sourceBusinessName: 'Acme',
      preview: {
        title: 'Profitable services firm',
        sector: 'Technology',
        region: 'Flanders',
        revenueRange: '€2M-€5M',
        hasVerifiedValuation: true,
      },
    })

    expect(
      parseManualChatStreamToolResult(
        'create_listing',
        {
          status: 'pending_approval',
          request: {
            report_id: 'report-1',
            accountant_customer_id: 'client-1',
            visibility: 'private',
            valuation_summary: { business_name: 'Acme', midpoint: '1000000' },
          },
          message: 'Ready to list',
        },
        createId
      )?.listingCreateRequests?.[0]
    ).toMatchObject({
      id: 'id-8',
      status: 'pending_approval',
      reportId: 'report-1',
      accountantCustomerId: 'client-1',
      visibility: 'private',
      message: 'Ready to list',
    })

    expect(
      parseManualChatStreamToolResult(
        'get_buyer_profile_preview',
        {
          status: 'ok',
          report_id: 'report-1',
          source_business_name: 'Acme',
          buyer_segments: [
            {
              id: 'strategic_acquirer',
              label: 'Strategic acquirer',
              fit_score: 91,
              recommended_angle: 'Lead with strategic fit.',
            },
          ],
        },
        createId
      )?.buyerProfilePreviews?.[0]
    ).toMatchObject({
      id: 'id-9',
      status: 'ok',
      reportId: 'report-1',
      sourceBusinessName: 'Acme',
      buyerSegments: [
        {
          id: 'strategic_acquirer',
          label: 'Strategic acquirer',
          fitScore: 91,
          recommendedAngle: 'Lead with strategic fit.',
        },
      ],
    })

    expect(
      parseManualChatStreamToolResult(
        'get_client_data_readiness',
        {
          status: 'needs_import_review',
          client_id: 'client-1',
          business_name: 'Acme',
          recommended_next_tool: 'open_import_review',
        },
        createId
      )?.clientDataReadinessPreviews?.[0]
    ).toMatchObject({
      id: 'id-10',
      status: 'needs_import_review',
      clientId: 'client-1',
      businessName: 'Acme',
      recommendedNextTool: 'open_import_review',
    })
  })

  it('returns null for non-renderable stream tool results', () => {
    expect(parseManualChatStreamToolResult('unknown_tool', {}, idFactory())).toBeNull()
    expect(parseManualChatStreamToolResult('update_field_value', {}, idFactory())).toBeNull()
    expect(parseManualChatStreamToolResult('run_valuation', undefined, idFactory())).toBeNull()
  })

  it('parses streaming agentic workflow cards and assigns ids', () => {
    const createId = idFactory()

    expect(
      parseManualChatStreamToolResult(
        'update_owner_profile_answer',
        {
          update: {
            field: 'key_man_dependency',
            value: 'low',
            label: 'Key person dependency',
          },
        },
        createId
      )?.ownerProfileAnswerRequests?.[0]
    ).toMatchObject({
      id: 'id-1',
      field: 'key_man_dependency',
      value: 'low',
      label: 'Key person dependency',
    })

    expect(
      parseManualChatStreamToolResult(
        'propose_integration_connect',
        {
          status: 'pending_approval',
          request: { provider: 'silverfin', auth_mode: 'oauth' },
        },
        createId
      )?.integrationConnectRequests?.[0]
    ).toMatchObject({ id: 'id-2', provider: 'silverfin', authMode: 'oauth' })

    expect(
      parseManualChatStreamToolResult(
        'propose_secure_credential',
        {
          status: 'pending_approval',
          request: {
            provider: 'exact',
            fields: [{ key: 'api_key', label: 'API key', masked: true, required: true }],
          },
        },
        createId
      )?.secureCredentialRequests?.[0]
    ).toMatchObject({ id: 'id-3', provider: 'exact' })

    expect(
      parseManualChatStreamToolResult(
        'propose_csv_upload',
        {
          status: 'pending_approval',
          request: { mode: 'single_client_trial_balance', expected_columns: ['account'] },
        },
        createId
      )?.csvUploadRequests?.[0]
    ).toMatchObject({ id: 'id-4', mode: 'single_client_trial_balance' })

    const multiSelectCard = parseManualChatStreamToolResult(
      'propose_multi_select',
      {
        status: 'pending_approval',
        request: {
          options: [
            { value: 'ebitda', label: 'EBITDA' },
            { value: 'sde', label: 'SDE' },
          ],
        },
      },
      createId
    )?.multiSelectRequests?.[0]
    expect(multiSelectCard).toMatchObject({ id: 'id-5' })
    expect(multiSelectCard?.options).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 'ebitda' })])
    )

    const singleSelectCard = parseManualChatStreamToolResult(
      'propose_single_select',
      {
        status: 'pending_approval',
        request: {
          options: [
            { value: 'yuki', label: 'Yuki' },
            { value: 'csv', label: 'CSV' },
          ],
        },
      },
      createId
    )?.singleSelectRequests?.[0]
    expect(singleSelectCard).toMatchObject({ id: 'id-6' })
    expect(singleSelectCard?.options).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 'csv' })])
    )

    expect(
      parseManualChatStreamToolResult(
        'create_client',
        {
          status: 'pending_approval',
          request: { business_name: 'Acme NV', company_number: 'BE0123456789' },
        },
        createId
      )?.clientCreateRequests?.[0]
    ).toMatchObject({ id: 'id-7', businessName: 'Acme NV' })

    expect(
      parseManualChatStreamToolResult(
        'start_client_valuation',
        {
          status: 'pending_approval',
          request: { client_id: 'client-1', business_name: 'Acme NV' },
        },
        createId
      )?.valuationSessionRequests?.[0]
    ).toMatchObject({ id: 'id-8', clientId: 'client-1', businessName: 'Acme NV' })

    expect(
      parseManualChatStreamToolResult(
        'open_import_review',
        {
          status: 'pending_approval',
          request: { client_id: 'client-1', actionable_flag_count: 2 },
        },
        createId
      )?.importReviewRequests?.[0]
    ).toMatchObject({ id: 'id-9', clientId: 'client-1', actionableFlagCount: 2 })
  })

  it('adds ids to non-streaming response cards', () => {
    const cards = addIdsToManualChatToolCards(
      {
        normalisationSuggestions: [{ category: 'rent' }],
        valuationRunRequests: [{ status: 'blocked', reason: 'missing' }],
      },
      idFactory()
    )

    expect(cards.normalisationSuggestions?.[0]).toMatchObject({
      id: 'id-1',
      status: 'pending',
      multiple: 5.2,
      category: 'rent',
    })
    expect(cards.valuationRunRequests?.[0]).toMatchObject({ id: 'id-2', reason: 'missing' })
  })

  it('appends cards to the target assistant message only', () => {
    const messages = [
      assistantMessage({ id: 'other', content: 'leave me' }),
      assistantMessage({ fieldUpdates: [{ field: 'ebitda', value: 1, label: 'EBITDA' }] }),
    ]

    const next = appendManualChatToolCardsToMessages(messages, 'message-1', {
      fieldUpdates: [{ field: 'revenue', value: 2, label: 'Revenue' }],
      reportGenerationRequests: [{ id: 'report-card', status: 'blocked' }],
      ownerProfileAnswerRequests: [{ id: 'owner-card', field: 'key_person' }],
      integrationConnectRequests: [{ id: 'integration-card', status: 'pending_approval' }],
      secureCredentialRequests: [{ id: 'credential-card', status: 'pending_approval' }],
      csvUploadRequests: [{ id: 'csv-card', status: 'pending_approval' }],
      multiSelectRequests: [{ id: 'multi-card', status: 'pending_approval' }],
      singleSelectRequests: [{ id: 'single-card', status: 'pending_approval' }],
      clientCreateRequests: [{ id: 'client-create-card', status: 'pending_approval' }],
      belgianCompanyBootstraps: [{ id: 'bootstrap-card', status: 'ok' }],
      valuationSessionRequests: [{ id: 'valuation-session-card', status: 'pending_approval' }],
      clientDataReadinessPreviews: [{ id: 'readiness-card', status: 'needs_import_review' }],
      importReviewRequests: [{ id: 'import-review-card', status: 'pending_approval' }],
      methodReadinessPreviews: [
        { id: 'methods-card', status: 'ok', readyMethods: ['ebitda'], blockedMethods: [] },
      ],
      listingPreviews: [{ id: 'listing-preview-card', status: 'ok' }],
      buyerProfilePreviews: [{ id: 'buyer-card', status: 'ok' }],
    })

    expect(next[0]).toBe(messages[0])
    expect(next[1].fieldUpdates).toEqual([
      { field: 'ebitda', value: 1, label: 'EBITDA' },
      { field: 'revenue', value: 2, label: 'Revenue' },
    ])
    expect(next[1].reportGenerationRequests).toEqual([{ id: 'report-card', status: 'blocked' }])
    expect(next[1].ownerProfileAnswerRequests).toEqual([{ id: 'owner-card', field: 'key_person' }])
    expect(next[1].integrationConnectRequests).toEqual([
      { id: 'integration-card', status: 'pending_approval' },
    ])
    expect(next[1].secureCredentialRequests).toEqual([
      { id: 'credential-card', status: 'pending_approval' },
    ])
    expect(next[1].csvUploadRequests).toEqual([{ id: 'csv-card', status: 'pending_approval' }])
    expect(next[1].multiSelectRequests).toEqual([{ id: 'multi-card', status: 'pending_approval' }])
    expect(next[1].singleSelectRequests).toEqual([
      { id: 'single-card', status: 'pending_approval' },
    ])
    expect(next[1].clientCreateRequests).toEqual([
      { id: 'client-create-card', status: 'pending_approval' },
    ])
    expect(next[1].belgianCompanyBootstraps).toEqual([{ id: 'bootstrap-card', status: 'ok' }])
    expect(next[1].valuationSessionRequests).toEqual([
      { id: 'valuation-session-card', status: 'pending_approval' },
    ])
    expect(next[1].clientDataReadinessPreviews).toEqual([
      { id: 'readiness-card', status: 'needs_import_review' },
    ])
    expect(next[1].importReviewRequests).toEqual([
      { id: 'import-review-card', status: 'pending_approval' },
    ])
    expect(next[1].methodReadinessPreviews).toEqual([
      { id: 'methods-card', status: 'ok', readyMethods: ['ebitda'], blockedMethods: [] },
    ])
    expect(next[1].listingPreviews).toEqual([{ id: 'listing-preview-card', status: 'ok' }])
    expect(next[1].buyerProfilePreviews).toEqual([{ id: 'buyer-card', status: 'ok' }])
  })

  it('marks proposal decisions in a selected card bucket', () => {
    const messages = [
      assistantMessage({
        valuationRunRequests: [
          { id: 'keep', status: 'blocked' },
          { id: 'target', status: 'blocked' },
        ],
      }),
    ]

    expect(
      markManualChatProposalDecision(messages, 'valuationRunRequests', 'target', 'approved')[0]
        .valuationRunRequests
    ).toEqual([
      { id: 'keep', status: 'blocked' },
      { id: 'target', status: 'blocked', decision: 'approved' },
    ])
  })

  it('applies a computed sellability score to the selected proposal card', () => {
    const messages = [
      assistantMessage({
        sellabilityRunRequests: [
          { id: 'keep', status: 'pending_approval' },
          { id: 'target', status: 'pending_approval' },
        ],
      }),
    ]

    expect(
      applyManualChatSellabilityComputedScore(messages, 'target', {
        score: 82,
        band: 'strong',
        confidence: 'high',
      })[0].sellabilityRunRequests
    ).toEqual([
      { id: 'keep', status: 'pending_approval' },
      {
        id: 'target',
        status: 'pending_approval',
        computedScore: { score: 82, band: 'strong', confidence: 'high' },
      },
    ])
  })
})
