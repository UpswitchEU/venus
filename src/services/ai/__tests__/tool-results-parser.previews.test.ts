// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { parseAIChatToolResults } from '../tool-results-parser'

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
