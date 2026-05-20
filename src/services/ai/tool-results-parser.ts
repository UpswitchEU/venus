/**
 * Pure-function parser for Titan's `toolResults` array, converting the
 * envelope shape into the Venus AIChatResponse fields used by the chat
 * drawer + ManualLayout host.
 *
 * Extracted from `AIChatService.sendMessage` so it can be tested in
 * isolation. The drawer's proposal-card kinds (normalization,
 * field_update, valuation_run, report_generation, sellability_run,
 * listing_create) each
 * have a pending_approval branch with a typed `request` payload AND a
 * `blocked` branch with `reason` + `missing` + `message`. Both branches
 * MUST be handled or the AI's "blocked" hints disappear from the UI.
 *
 * Mirrors Mercury's `parseToolResultsToCards` in
 * `apps/mercury/shared/components/ai-dock/tool-card-parser.ts` but produces
 * the legacy Venus response shape (separate arrays per kind instead of a
 * single ToolCard discriminated union). The two parsers are intentionally
 * kept in sync — if Titan adds a sixth tool type or renames a field, both
 * need updating in lockstep. The new type's test in this file + the
 * Mercury parser test will both fail, surfacing the drift at code review.
 */

import type {
  BelgianCompanyBootstrap,
  BuyerProfilePreview,
  ClientCreateRequest,
  ClientDataReadinessPreview,
  CsvUploadRequest,
  FieldUpdateParsed,
  ImportReviewRequest,
  ImportReviewRequestPending,
  IntegrationConnectRequest,
  ListingPreview,
  MethodReadinessPreview,
  MultiSelectRequest,
  OwnerProfileAnswerRequest,
  ParsedToolResults,
  SecureCredentialRequest,
  SingleSelectRequest,
  ValuationSessionRequest,
} from './tool-result-types'
import {
  parseListingCreateRequest,
  parseRegistrySearchResults,
  parseReportGenerationRequest,
  parseSellabilityRunRequest,
  parseValuationRunRequest,
} from './tool-workflow-result-parsers'

export type {
  BelgianCompanyBootstrap,
  BuyerProfilePreview,
  ClientCreateRequest,
  ClientDataReadinessPreview,
  CsvUploadRequest,
  FieldUpdateParsed,
  ImportReviewRequest,
  ImportReviewRequestPending,
  IntegrationConnectRequest,
  ListingCreateRequest,
  ListingCreateRequestBlocked,
  ListingCreateRequestPending,
  ListingPreview,
  MethodReadinessPreview,
  MultiSelectRequest,
  OwnerProfileAnswerRequest,
  ParsedToolResults,
  RegistrySearchHit,
  RegistrySearchResults,
  ReportGenerationRequest,
  ReportGenerationRequestBlocked,
  ReportGenerationRequestPending,
  SecureCredentialRequest,
  SellabilityRunRequest,
  SellabilityRunRequestBlocked,
  SellabilityRunRequestPending,
  SingleSelectRequest,
  ValuationRunRequest,
  ValuationRunRequestBlocked,
  ValuationRunRequestPending,
  ValuationSessionRequest,
} from './tool-result-types'

function emptyResult(): ParsedToolResults {
  return {
    normalisationSuggestions: [],
    fieldUpdates: [],
    valuationRunRequests: [],
    reportGenerationRequests: [],
    sellabilityRunRequests: [],
    ownerProfileAnswerRequests: [],
    integrationConnectRequests: [],
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
    listingPreviews: [],
    listingCreateRequests: [],
    buyerProfilePreviews: [],
    registrySearchResults: [],
  }
}

/**
 * Parse Titan's `toolResults` array into the Venus drawer-facing response
 * shape. Defensive against:
 *   - Non-array input (returns empty result, not throw)
 *   - Individual entries missing `type` / `data`
 *   - Unknown `type` strings (silently skipped — forward compat for new
 *     Titan tool kinds the FE hasn't taught itself to render yet)
 *   - Pending-approval payloads missing the nested `request` object
 *   - Blocked payloads with missing optional fields
 *
 * The parser returns ALL arrays as `[]` rather than `undefined` so
 * the caller can `for-of` without null-checks. Callers that conditionally
 * surface UI based on array length should check `.length > 0`.
 */
export function parseAIChatToolResults(toolResults: unknown): ParsedToolResults {
  if (!Array.isArray(toolResults)) return emptyResult()
  const out = emptyResult()

  for (const tr of toolResults) {
    if (!tr || typeof tr !== 'object') continue
    const entry = tr as { type?: unknown; data?: unknown }
    const type = entry.type
    const data = entry.data
    if (typeof type !== 'string') continue

    switch (type) {
      case 'normalization_suggestion':
        if (data && typeof data === 'object') {
          out.normalisationSuggestions.push(data)
        }
        break

      case 'field_update': {
        const update = (data as { update?: unknown })?.update as Record<string, unknown> | undefined
        if (!update || typeof update !== 'object') break
        const field = update.field
        const value = update.value
        const label = update.label
        if (typeof field !== 'string' || field.length === 0) break
        if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean')
          break
        if (typeof label !== 'string') break
        const confidence = update.confidence
        out.fieldUpdates.push({
          field,
          value,
          label,
          source: 'ai',
          ...(confidence === 'high' || confidence === 'medium' || confidence === 'low'
            ? { confidence }
            : {}),
        })
        break
      }

      case 'valuation_run_request':
        out.valuationRunRequests.push(...parseValuationRunRequest(data))
        break

      case 'report_generation_request':
        out.reportGenerationRequests.push(...parseReportGenerationRequest(data))
        break

      case 'sellability_run_request':
        out.sellabilityRunRequests.push(...parseSellabilityRunRequest(data))
        break

      case 'owner_profile_answer_request':
        out.ownerProfileAnswerRequests.push(...parseOwnerProfileAnswerRequest(data))
        break

      case 'integration_connect_request':
        out.integrationConnectRequests.push(...parseIntegrationConnectRequest(data))
        break

      case 'secure_credential_request':
        out.secureCredentialRequests.push(...parseSecureCredentialRequest(data))
        break

      case 'csv_upload_request':
        out.csvUploadRequests.push(...parseCsvUploadRequest(data))
        break

      case 'multi_select_request':
        out.multiSelectRequests.push(...parseMultiSelectRequest(data))
        break

      case 'single_select_request':
        out.singleSelectRequests.push(...parseSingleSelectRequest(data))
        break

      case 'client_create_request':
        out.clientCreateRequests.push(...parseClientCreateRequest(data))
        break

      case 'belgian_company_bootstrap':
        out.belgianCompanyBootstraps.push(...parseBelgianCompanyBootstrap(data))
        break

      case 'valuation_session_request':
        out.valuationSessionRequests.push(...parseValuationSessionRequest(data))
        break

      case 'client_data_readiness':
        out.clientDataReadinessPreviews.push(...parseClientDataReadiness(data))
        break

      case 'import_review_request':
        out.importReviewRequests.push(...parseImportReviewRequest(data))
        break

      case 'method_readiness':
        out.methodReadinessPreviews.push(...parseMethodReadiness(data))
        break

      case 'listing_preview':
        out.listingPreviews.push(...parseListingPreview(data))
        break

      case 'listing_create_request':
        out.listingCreateRequests.push(...parseListingCreateRequest(data))
        break

      case 'buyer_profile_preview':
        out.buyerProfilePreviews.push(...parseBuyerProfilePreview(data))
        break

      case 'registry_search_results':
        out.registrySearchResults.push(...parseRegistrySearchResults(data))
        break

      default:
        // Unknown type — silently skip (forward-compat).
        break
    }
  }

  return out
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalStringList(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : undefined
}

function ownerProfileAnswerValue(value: unknown): OwnerProfileAnswerRequest['value'] | undefined {
  if (
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value
  }
  return undefined
}

function parseOwnerProfileAnswerRequest(data: unknown): OwnerProfileAnswerRequest[] {
  const d = recordValue(data)
  const update = recordValue(d?.update)
  if (!update) return []

  return [
    {
      field: optionalString(update.field),
      value: ownerProfileAnswerValue(update.value),
      label: optionalString(update.label),
      reason: optionalString(update.reason),
      complete: update.complete === true,
      ...(typeof update.accountantCustomerId === 'string' && update.accountantCustomerId.length > 0
        ? { accountantCustomerId: update.accountantCustomerId }
        : {}),
    },
  ]
}

function parseIntegrationConnectRequest(data: unknown): IntegrationConnectRequest[] {
  const d = recordValue(data)
  const req = recordValue(d?.request)
  if (d?.status !== 'pending_approval' || !req) return []

  const authMode = req.auth_mode
  return [
    {
      status: 'pending_approval',
      provider: optionalString(req.provider),
      authMode: authMode === 'oauth' || authMode === 'api_key' ? authMode : undefined,
      reason: optionalString(req.reason),
      targetContext: typeof req.target_context === 'string' ? req.target_context : null,
      message: optionalString(d.message),
    },
  ]
}

function parseSecureCredentialRequest(data: unknown): SecureCredentialRequest[] {
  const d = recordValue(data)
  const req = recordValue(d?.request)
  if (d?.status !== 'pending_approval' || !req) return []

  const fields = Array.isArray(req.fields)
    ? req.fields
        .filter(
          (field): field is Record<string, unknown> => typeof field === 'object' && field !== null
        )
        .map((field) => ({
          key: typeof field.key === 'string' ? field.key : '',
          label: typeof field.label === 'string' ? field.label : '',
          masked: field.masked !== false,
          required: field.required !== false,
          helper: optionalString(field.helper),
        }))
        .filter((field) => field.key.length > 0 && field.label.length > 0)
    : []

  return [
    {
      status: 'pending_approval',
      provider: optionalString(req.provider),
      reason: optionalString(req.reason),
      fields,
      submitPath: optionalString(req.submit_path),
      message: optionalString(d.message),
    },
  ]
}

function parseCsvUploadRequest(data: unknown): CsvUploadRequest[] {
  const d = recordValue(data)
  const req = recordValue(d?.request)
  if (d?.status !== 'pending_approval' || !req) return []

  const mode = req.mode
  return [
    {
      status: 'pending_approval',
      mode: mode === 'single_client_trial_balance' || mode === 'bulk_clients' ? mode : undefined,
      label: optionalString(req.label),
      reason: optionalString(req.reason),
      expectedColumns: optionalStringList(req.expected_columns) ?? [],
      submitPath: optionalString(req.submit_path),
      maxSizeBytes: typeof req.max_size_bytes === 'number' ? req.max_size_bytes : undefined,
      accept: optionalString(req.accept),
      message: optionalString(d.message),
    },
  ]
}

function parseSelectOptions(
  value: unknown
): Array<{ value: string; label: string; helper?: string }> {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (option): option is Record<string, unknown> => typeof option === 'object' && option !== null
    )
    .map((option) => ({
      value: typeof option.value === 'string' ? option.value : '',
      label: typeof option.label === 'string' ? option.label : '',
      helper: optionalString(option.helper),
    }))
    .filter((option) => option.value.length > 0 && option.label.length > 0)
}

function parseMultiSelectRequest(data: unknown): MultiSelectRequest[] {
  const d = recordValue(data)
  const req = recordValue(d?.request)
  if (d?.status !== 'pending_approval' || !req) return []
  const options = parseSelectOptions(req.options)
  if (options.length < 2) return []

  return [
    {
      status: 'pending_approval',
      title: optionalString(req.title),
      options,
      minSelections: typeof req.min_selections === 'number' ? req.min_selections : 0,
      maxSelections: typeof req.max_selections === 'number' ? req.max_selections : options.length,
      preselected: optionalStringList(req.preselected) ?? [],
      submitPath: optionalString(req.submit_path),
      reason: optionalString(req.reason),
    },
  ]
}

function parseSingleSelectRequest(data: unknown): SingleSelectRequest[] {
  const d = recordValue(data)
  const req = recordValue(d?.request)
  if (d?.status !== 'pending_approval' || !req) return []
  const options = parseSelectOptions(req.options)
  if (options.length < 2) return []

  return [
    {
      status: 'pending_approval',
      title: optionalString(req.title),
      options,
      preselected: typeof req.preselected === 'string' ? req.preselected : null,
      submitPath: optionalString(req.submit_path),
      reason: optionalString(req.reason),
    },
  ]
}

function parseClientCreateRequest(data: unknown): ClientCreateRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const status = d.status
  const req = recordValue(d.request)
  if ((status === 'pending_approval' || status === 'auto_approved') && req) {
    return [
      {
        status,
        businessName: optionalString(req.business_name),
        customerEmail: typeof req.customer_email === 'string' ? req.customer_email : null,
        companyNumber: typeof req.company_number === 'string' ? req.company_number : null,
        industry: typeof req.industry === 'string' ? req.industry : null,
        location: typeof req.location === 'string' ? req.location : null,
        notes: typeof req.notes === 'string' ? req.notes : null,
        message: optionalString(d.message),
      },
    ]
  }
  if (status === 'blocked') {
    return [
      {
        status: 'blocked',
        reason: optionalString(d.reason),
        message: optionalString(d.message),
      },
    ]
  }
  return []
}

function parseValuationSessionRequest(data: unknown): ValuationSessionRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const status = d.status
  const req = recordValue(d.request)
  if ((status === 'pending_approval' || status === 'auto_approved') && req) {
    return [
      {
        status,
        clientId: optionalString(req.client_id),
        businessName: typeof req.business_name === 'string' ? req.business_name : null,
        customerEmail: typeof req.customer_email === 'string' ? req.customer_email : null,
        hasBusinessCard:
          typeof req.has_business_card === 'boolean' ? req.has_business_card : undefined,
        latestValuationId:
          typeof req.latest_valuation_id === 'string' ? req.latest_valuation_id : null,
        hasSyncedFinancials:
          typeof req.has_synced_financials === 'boolean' ? req.has_synced_financials : undefined,
        stpStatus: typeof req.stp_status === 'string' ? req.stp_status : null,
        message: optionalString(d.message),
      },
    ]
  }
  if (status === 'blocked') {
    return [
      {
        status: 'blocked',
        reason: optionalString(d.reason),
        message: optionalString(d.message),
      },
    ]
  }
  return []
}

function parseImportReviewAccountingSources(
  value: unknown
): NonNullable<ImportReviewRequestPending['accountingSources']> {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (source): source is Record<string, unknown> => typeof source === 'object' && source !== null
    )
    .map((source) => ({
      provider: typeof source.provider === 'string' ? source.provider : '',
      clientKey: typeof source.client_key === 'string' ? source.client_key : null,
      isPrimaryForValuation:
        typeof source.is_primary_for_valuation === 'boolean'
          ? source.is_primary_for_valuation
          : undefined,
      lastSyncAt: typeof source.last_sync_at === 'string' ? source.last_sync_at : null,
    }))
    .filter((source) => source.provider.length > 0)
}

function parseImportReviewTopFlags(
  value: unknown
): NonNullable<ImportReviewRequestPending['topFlags']> {
  if (!Array.isArray(value)) return []
  return value
    .filter((flag): flag is Record<string, unknown> => typeof flag === 'object' && flag !== null)
    .map((flag) => ({
      year: typeof flag.year === 'string' ? flag.year : undefined,
      field: typeof flag.field === 'string' ? flag.field : null,
      code: typeof flag.code === 'string' ? flag.code : null,
      severity: typeof flag.severity === 'string' ? flag.severity : null,
      message: typeof flag.message === 'string' ? flag.message : null,
    }))
}

function parseImportReviewRequest(data: unknown): ImportReviewRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const status = d.status
  const req = recordValue(d.request)
  if ((status === 'pending_approval' || status === 'auto_approved') && req) {
    return [
      {
        status,
        clientId: optionalString(req.client_id),
        businessName: typeof req.business_name === 'string' ? req.business_name : null,
        hasSyncedFinancials:
          typeof req.has_synced_financials === 'boolean' ? req.has_synced_financials : undefined,
        stpStatus: typeof req.stp_status === 'string' ? req.stp_status : null,
        accountingSources: parseImportReviewAccountingSources(req.accounting_sources),
        actionableFlagCount:
          typeof req.actionable_flag_count === 'number' ? req.actionable_flag_count : undefined,
        topFlags: parseImportReviewTopFlags(req.top_flags),
        message: optionalString(d.message),
      },
    ]
  }
  if (status === 'blocked') {
    return [
      {
        status: 'blocked',
        clientId: optionalString(d.client_id),
        reason: optionalString(d.reason),
        message: optionalString(d.message),
      },
    ]
  }
  return []
}

function parseClientDataReadiness(data: unknown): ClientDataReadinessPreview[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  if (typeof d.status !== 'string') return []

  const sources = Array.isArray(d.accounting_sources)
    ? d.accounting_sources
        .filter(
          (source): source is Record<string, unknown> =>
            typeof source === 'object' && source !== null
        )
        .map((source) => ({
          provider: typeof source.provider === 'string' ? source.provider : '',
          clientKey: typeof source.client_key === 'string' ? source.client_key : null,
          isPrimaryForValuation:
            typeof source.is_primary_for_valuation === 'boolean'
              ? source.is_primary_for_valuation
              : undefined,
          lastSyncAt: typeof source.last_sync_at === 'string' ? source.last_sync_at : null,
        }))
        .filter((source) => source.provider.length > 0)
    : []
  const summary =
    d.import_quality_summary && typeof d.import_quality_summary === 'object'
      ? (d.import_quality_summary as Record<string, unknown>)
      : null
  const topFlags = Array.isArray(summary?.top_flags)
    ? summary.top_flags
        .filter(
          (flag): flag is Record<string, unknown> => typeof flag === 'object' && flag !== null
        )
        .map((flag) => ({
          year: typeof flag.year === 'string' ? flag.year : undefined,
          field: typeof flag.field === 'string' ? flag.field : null,
          code: typeof flag.code === 'string' ? flag.code : null,
          severity: typeof flag.severity === 'string' ? flag.severity : null,
          message: typeof flag.message === 'string' ? flag.message : null,
        }))
    : []

  return [
    {
      status: d.status,
      clientId: typeof d.client_id === 'string' ? d.client_id : undefined,
      businessName: typeof d.business_name === 'string' ? d.business_name : null,
      hasBusinessCard: typeof d.has_business_card === 'boolean' ? d.has_business_card : undefined,
      hasSyncedFinancials:
        typeof d.has_synced_financials === 'boolean' ? d.has_synced_financials : undefined,
      hasFinancialData:
        typeof d.has_financial_data === 'boolean' ? d.has_financial_data : undefined,
      financialSyncedAt: typeof d.financial_synced_at === 'string' ? d.financial_synced_at : null,
      stpStatus: typeof d.stp_status === 'string' ? d.stp_status : null,
      computedStpStatus: typeof d.computed_stp_status === 'string' ? d.computed_stp_status : null,
      latestValuationId: typeof d.latest_valuation_id === 'string' ? d.latest_valuation_id : null,
      accountingSources: sources,
      importQualitySummary: summary
        ? {
            years: Array.isArray(summary.years)
              ? summary.years.filter((year): year is string => typeof year === 'string')
              : [],
            minConfidence:
              typeof summary.min_confidence === 'number' ? summary.min_confidence : null,
            errorCount: typeof summary.error_count === 'number' ? summary.error_count : undefined,
            warningCount:
              typeof summary.warning_count === 'number' ? summary.warning_count : undefined,
            infoCount: typeof summary.info_count === 'number' ? summary.info_count : undefined,
            actionableFlagCount:
              typeof summary.actionable_flag_count === 'number'
                ? summary.actionable_flag_count
                : undefined,
            topFlags,
          }
        : null,
      recommendedNextAction:
        typeof d.recommended_next_action === 'string' ? d.recommended_next_action : undefined,
      recommendedNextTool:
        typeof d.recommended_next_tool === 'string' ? d.recommended_next_tool : null,
      recommendedNextRoute:
        typeof d.recommended_next_route === 'string' ? d.recommended_next_route : null,
      message: typeof d.message === 'string' ? d.message : undefined,
    },
  ]
}

function parseMethodReadiness(data: unknown): MethodReadinessPreview[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  if (typeof d.status !== 'string') return []
  const readyMethods = Array.isArray(d.ready_methods)
    ? d.ready_methods.filter((method): method is string => typeof method === 'string')
    : []
  const blockedMethods = Array.isArray(d.blocked_methods)
    ? d.blocked_methods.filter((method): method is string => typeof method === 'string')
    : []

  return [
    {
      status: d.status === 'ok' ? 'ok' : 'blocked',
      reportId: typeof d.report_id === 'string' ? d.report_id : undefined,
      businessName: typeof d.business_name === 'string' ? d.business_name : null,
      readinessSource: typeof d.readiness_source === 'string' ? d.readiness_source : null,
      readyMethods,
      blockedMethods,
      reason: typeof d.reason === 'string' ? d.reason : d.status === 'ok' ? undefined : d.status,
      message: typeof d.message === 'string' ? d.message : undefined,
    },
  ]
}

function parseBelgianCompanyBootstrap(data: unknown): BelgianCompanyBootstrap[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  if (
    d.status !== 'ok' &&
    d.status !== 'partial' &&
    d.status !== 'blocked' &&
    d.status !== 'failed'
  ) {
    return []
  }

  const identity =
    d.identity && typeof d.identity === 'object' ? (d.identity as Record<string, unknown>) : null
  const benchmark =
    d.benchmark && typeof d.benchmark === 'object' ? (d.benchmark as Record<string, unknown>) : null
  const filing =
    d.filing_summary && typeof d.filing_summary === 'object'
      ? (d.filing_summary as Record<string, unknown>)
      : null
  const preview =
    d.valuation_preview && typeof d.valuation_preview === 'object'
      ? (d.valuation_preview as Record<string, unknown>)
      : null

  return [
    {
      status: d.status,
      reason: typeof d.reason === 'string' ? d.reason : undefined,
      message: typeof d.message === 'string' ? d.message : undefined,
      identity: identity
        ? {
            legalName: typeof identity.legal_name === 'string' ? identity.legal_name : null,
            legalForm: typeof identity.legal_form === 'string' ? identity.legal_form : null,
            kboNumber: typeof identity.kbo_number === 'string' ? identity.kbo_number : null,
            address: typeof identity.address === 'string' ? identity.address : null,
            city: typeof identity.city === 'string' ? identity.city : null,
            postalCode: typeof identity.postal_code === 'string' ? identity.postal_code : null,
            naceCode: typeof identity.nace_code === 'string' ? identity.nace_code : null,
            naceDescription:
              typeof identity.nace_description === 'string' ? identity.nace_description : null,
            foundationDate:
              typeof identity.foundation_date === 'string' ? identity.foundation_date : null,
            isActive: typeof identity.is_active === 'boolean' ? identity.is_active : null,
          }
        : null,
      benchmark: benchmark
        ? {
            status: typeof benchmark.status === 'string' ? benchmark.status : null,
            businessTypeTitle:
              typeof benchmark.business_type_title === 'string'
                ? benchmark.business_type_title
                : null,
            evEbitdaMedian:
              typeof benchmark.ev_ebitda_median === 'number' ? benchmark.ev_ebitda_median : null,
            confidence: typeof benchmark.confidence === 'string' ? benchmark.confidence : null,
          }
        : null,
      filingSummary: filing
        ? {
            status: typeof filing.status === 'string' ? filing.status : null,
            source: typeof filing.source === 'string' ? filing.source : null,
            filingYear: typeof filing.filing_year === 'number' ? filing.filing_year : null,
            yearsAvailable:
              typeof filing.years_available === 'number' ? filing.years_available : null,
            revenue: typeof filing.revenue === 'number' ? filing.revenue : null,
            ebitda: typeof filing.ebitda === 'number' ? filing.ebitda : null,
            dataHealthMessage:
              typeof filing.data_health_message === 'string' ? filing.data_health_message : null,
          }
        : null,
      valuationPreview: preview
        ? {
            status: typeof preview.status === 'string' ? preview.status : null,
            method: typeof preview.method === 'string' ? preview.method : null,
            ebitdaUsed: typeof preview.ebitda_used === 'number' ? preview.ebitda_used : null,
            ebitdaYear: typeof preview.ebitda_year === 'number' ? preview.ebitda_year : null,
            evMid: typeof preview.ev_mid === 'number' ? preview.ev_mid : null,
            equityMid: typeof preview.equity_mid === 'number' ? preview.equity_mid : null,
          }
        : null,
    },
  ]
}

function parseListingPreview(data: unknown): ListingPreview[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>

  if (d.status === 'ok') {
    const preview =
      d.preview && typeof d.preview === 'object' ? (d.preview as Record<string, unknown>) : null
    const missingFields = Array.isArray(d.missing_fields)
      ? d.missing_fields.filter((field): field is string => typeof field === 'string')
      : []

    return [
      {
        status: 'ok',
        reportId: typeof d.report_id === 'string' ? d.report_id : undefined,
        sourceBusinessName:
          typeof d.source_business_name === 'string' ? d.source_business_name : null,
        missingFields,
        nextActionHint: typeof d.next_action_hint === 'string' ? d.next_action_hint : null,
        preview: preview
          ? {
              title: typeof preview.anonymized_title === 'string' ? preview.anonymized_title : null,
              businessType:
                typeof preview.business_type === 'string' ? preview.business_type : null,
              sector: typeof preview.sector === 'string' ? preview.sector : null,
              industry: typeof preview.industry === 'string' ? preview.industry : null,
              region: typeof preview.region === 'string' ? preview.region : null,
              province: typeof preview.province === 'string' ? preview.province : null,
              yearCommenced:
                typeof preview.year_commenced === 'number' ? preview.year_commenced : null,
              employeeRange:
                typeof preview.employee_range === 'string' ? preview.employee_range : null,
              revenueRange:
                typeof preview.revenue_range === 'string' ? preview.revenue_range : null,
              equityStake: typeof preview.equity_stake === 'string' ? preview.equity_stake : null,
              ownershipStructure:
                typeof preview.ownership_structure === 'string'
                  ? preview.ownership_structure
                  : null,
              ownerManagersCount:
                typeof preview.owner_managers_count === 'number'
                  ? preview.owner_managers_count
                  : null,
              status: typeof preview.status === 'string' ? preview.status : null,
              featured: typeof preview.featured === 'boolean' ? preview.featured : null,
              ndaRequired: typeof preview.nda_required === 'boolean' ? preview.nda_required : null,
              viewCount: typeof preview.view_count === 'number' ? preview.view_count : null,
              hasVerifiedValuation:
                typeof preview.has_verified_valuation === 'boolean'
                  ? preview.has_verified_valuation
                  : null,
            }
          : null,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }

  if (typeof d.status !== 'string') return []
  return [
    {
      status: 'blocked',
      reportId: typeof d.report_id === 'string' ? d.report_id : undefined,
      reason: typeof d.reason === 'string' ? d.reason : d.status,
      message: typeof d.message === 'string' ? d.message : undefined,
    },
  ]
}

function parseBuyerProfilePreview(data: unknown): BuyerProfilePreview[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>

  if (d.status === 'blocked') {
    return [
      {
        status: 'blocked',
        reportId: typeof d.report_id === 'string' ? d.report_id : undefined,
        reason: typeof d.reason === 'string' ? d.reason : undefined,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }

  if (d.status !== 'ok') return []

  const readiness =
    d.listing_readiness && typeof d.listing_readiness === 'object'
      ? (d.listing_readiness as Record<string, unknown>)
      : null
  const missingFields = Array.isArray(readiness?.missing_fields)
    ? readiness.missing_fields.filter((field): field is string => typeof field === 'string')
    : []
  const buyerSegments = Array.isArray(d.buyer_segments)
    ? d.buyer_segments
        .filter(
          (segment): segment is Record<string, unknown> =>
            typeof segment === 'object' && segment !== null
        )
        .map((segment) => ({
          id: typeof segment.id === 'string' ? segment.id : undefined,
          label: typeof segment.label === 'string' ? segment.label : '',
          fitScore: typeof segment.fit_score === 'number' ? segment.fit_score : null,
          recommendedAngle:
            typeof segment.recommended_angle === 'string' ? segment.recommended_angle : null,
        }))
        .filter((segment) => segment.label.length > 0)
    : []

  return [
    {
      status: 'ok',
      reportId: typeof d.report_id === 'string' ? d.report_id : undefined,
      sourceBusinessName:
        typeof d.source_business_name === 'string' ? d.source_business_name : null,
      listingReadiness: {
        status: typeof readiness?.status === 'string' ? readiness.status : null,
        missingFields,
      },
      buyerSegments,
      message: typeof d.message === 'string' ? d.message : undefined,
    },
  ]
}

/**
 * State the `dispatchAIChatChunk` dispatcher reads + writes across calls
 * within a single stream consumption. The caller owns the state object
 * and threads it through each chunk so the dispatcher stays pure.
 */
export interface ChunkDispatchState {
  resolvedConversationId: string
  doneReceived: boolean
}

export function makeChunkDispatchState(): ChunkDispatchState {
  return { resolvedConversationId: '', doneReceived: false }
}

/**
 * Callback bag the dispatcher fires for each meaningful chunk type.
 * Mirrors `AIChatService.StreamCallbacks` exactly so the service can
 * pass its callback object straight through.
 */
export interface ChunkDispatchCallbacks {
  onText?: (text: string) => void
  onToolStart?: (toolName: string) => void
  onToolResult?: (toolName: string, result: unknown) => void
  onDone?: (conversationId?: string) => void
  onError?: (error: string) => void
}

/**
 * Dispatch a single SSE chunk (already JSON-parsed) to the appropriate
 * callback. Extracted from `AIChatService.streamMessage` so the routing
 * logic — which had 5 cases × subtle behaviours like `conversationId`
 * capture on text chunks and `doneReceived` flag flips — is no longer
 * inline-untested code.
 *
 * Behaviour pinned by tests:
 *   - `text` chunks: capture `conversationId` into state (used as the
 *     final `done` fallback) and fire `onText` ONLY when `content` is
 *     non-empty (avoid empty-string callback noise).
 *   - `tool_start`: fire onToolStart with the toolName (caller decides
 *     what to do with missing/undefined toolName — it's not our job to
 *     validate the upstream Titan envelope).
 *   - `tool_result`: fire onToolResult with toolName + toolResult.
 *   - `done`: flip `doneReceived` to true and fire onDone with the
 *     chunk's own conversationId, falling back to the captured one.
 *   - `error`: flip `doneReceived` to true (so the outer "if no done,
 *     fire onDone" guard doesn't double-fire) and surface the error
 *     message with a fallback to `"Unknown error"`.
 *   - Unknown types: silently skip (forward-compat for new Titan
 *     chunk types).
 *
 * Returns the state object (mutated in place) for chainable use.
 */
export function dispatchAIChatChunk(
  chunk: unknown,
  state: ChunkDispatchState,
  callbacks: ChunkDispatchCallbacks
): ChunkDispatchState {
  if (!chunk || typeof chunk !== 'object') return state
  const c = chunk as Record<string, unknown>
  const type = c.type
  if (typeof type !== 'string') return state

  switch (type) {
    case 'text':
      if (typeof c.conversationId === 'string' && c.conversationId.length > 0) {
        state.resolvedConversationId = c.conversationId
      }
      if (typeof c.content === 'string' && c.content.length > 0) {
        callbacks.onText?.(c.content)
      }
      break
    case 'tool_start':
      if (typeof c.toolName === 'string') {
        callbacks.onToolStart?.(c.toolName)
      }
      break
    case 'tool_result':
      if (typeof c.toolName === 'string') {
        callbacks.onToolResult?.(c.toolName, c.toolResult)
      }
      break
    case 'done':
      state.doneReceived = true
      callbacks.onDone?.(
        typeof c.conversationId === 'string' && c.conversationId.length > 0
          ? c.conversationId
          : state.resolvedConversationId || undefined
      )
      break
    case 'error':
      state.doneReceived = true
      callbacks.onError?.(
        typeof c.error === 'string' && c.error.length > 0 ? c.error : 'Unknown error'
      )
      break
    default:
      // Unknown type — silently skip for forward-compat.
      break
  }

  return state
}
