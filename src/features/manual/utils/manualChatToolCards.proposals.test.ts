// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { idFactory, parseManualChatStreamToolResult } from './manualChatToolCards.testUtils'

describe('manualChatToolCards proposal stream parsing', () => {
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

    expect(
      parseManualChatStreamToolResult(
        'get_buyer_ready_package',
        {
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
        createId
      )?.buyerReadyCards?.[0]
    ).toMatchObject({
      id: 'id-11',
      kind: 'buyer_package_status',
      entityId: 'entity-1',
      includedArtifactCount: 7,
      missingRequiredArtifactTypes: ['legal_readiness'],
    })

    expect(
      parseManualChatStreamToolResult(
        'generate_buyer_ready_package',
        {
          status: 'pending_approval',
          request: {
            report_id: 'report-1',
            reason: 'Generate the first IM',
            region_label: 'Flanders',
            country_code: 'BE',
            result_summary: {
              business_name: 'Acme BV',
              currency: 'EUR',
              midpoint: 1200000,
            },
          },
        },
        createId
      )?.buyerReadyCards?.[0]
    ).toMatchObject({
      id: 'id-12',
      kind: 'buyer_package_generation',
      reportId: 'report-1',
      regionLabel: 'Flanders',
      resultSummary: { businessName: 'Acme BV', midpoint: 1200000 },
    })
  })
})
