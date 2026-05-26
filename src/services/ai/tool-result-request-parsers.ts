import { optionalString, optionalStringList, recordValue } from './tool-result-parser-utils'
import type {
  AcknowledgeWarningRequest,
  BelgianCompanyBootstrap,
  BuyerProfilePreview,
  ClientCreateRequest,
  ClientDataReadinessPreview,
  CsvUploadRequest,
  ImportReviewRequest,
  ImportReviewRequestPending,
  IntegrationConnectRequest,
  IntegrationSyncRequest,
  ListingPreview,
  ListingVisibilityRequest,
  MethodReadinessPreview,
  MultiSelectRequest,
  OwnerProfileAnswerRequest,
  OwnerReminderRequest,
  SecureCredentialRequest,
  ShareTokenRequest,
  ShareTokenRevokeRequest,
  SingleSelectRequest,
  BulkValuationRunRequest,
  ListingFieldUpdateRequest,
  ValuationDefaultsPreview,
  ValuationDefaultsRequest,
  ValuationMethodPreferenceRequest,
  ValuationSessionRequest,
} from './tool-result-types'

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

export function parseOwnerProfileAnswerRequest(data: unknown): OwnerProfileAnswerRequest[] {
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

export function parseIntegrationConnectRequest(data: unknown): IntegrationConnectRequest[] {
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

export function parseIntegrationSyncRequest(data: unknown): IntegrationSyncRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const req = recordValue(d.request)
  if (d.status === 'pending_approval' && req) {
    const scope = req.scope
    return [
      {
        status: 'pending_approval',
        provider: optionalString(req.provider),
        scope: scope === 'provider_scope' || scope === 'client_scope' ? scope : undefined,
        clientId: typeof req.client_id === 'string' ? req.client_id : null,
        reason: optionalString(req.reason),
        message: optionalString(d.message),
      },
    ]
  }
  if (d.status === 'blocked') {
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

export function parseSyncStatus(data: unknown): import('./tool-result-types').SyncStatusPreview[] {
  const d = recordValue(data)
  if (!d) return []
  if (d.status !== 'ok' && d.status !== 'failed') return []
  const providersRaw = Array.isArray(d.providers) ? d.providers : []
  const providers = providersRaw
    .map((entry) => recordValue(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => ({
      provider: typeof entry.provider === 'string' ? entry.provider : '',
      connected: entry.connected === true,
      syncInProgress: entry.syncInProgress === true,
      lastSyncAt: typeof entry.lastSyncAt === 'string' ? entry.lastSyncAt : null,
      clientCount:
        typeof entry.clientCount === 'number' && Number.isFinite(entry.clientCount)
          ? entry.clientCount
          : null,
      error: typeof entry.error === 'string' ? entry.error : null,
    }))
    .filter((p) => p.provider.length > 0)
  return [
    {
      status: d.status,
      providers,
      message: optionalString(d.message),
    },
  ]
}

export function parseOwnerInviteAccountantRequest(
  data: unknown
): import('./tool-result-types').OwnerInviteAccountantRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const req = recordValue(d.request)
  if (d.status === 'pending_approval' && req) {
    return [
      {
        status: 'pending_approval',
        accountantEmail: optionalString(req.accountant_email),
        customMessage: typeof req.custom_message === 'string' ? req.custom_message : null,
        reason: optionalString(req.reason),
        message: optionalString(d.message),
      },
    ]
  }
  if (d.status === 'blocked') {
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

export function parseOwnerReminderRequest(data: unknown): OwnerReminderRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const req = recordValue(d.request)
  if (d.status === 'pending_approval' && req) {
    return [
      {
        status: 'pending_approval',
        clientId: optionalString(req.client_id),
        businessName: typeof req.business_name === 'string' ? req.business_name : null,
        customerEmail: typeof req.customer_email === 'string' ? req.customer_email : null,
        customMessage: typeof req.custom_message === 'string' ? req.custom_message : null,
        reason: optionalString(req.reason),
        message: optionalString(d.message),
      },
    ]
  }
  if (d.status === 'blocked') {
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

export function parseListingVisibilityRequest(data: unknown): ListingVisibilityRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const req = recordValue(d.request)
  if (d.status === 'pending_approval' && req) {
    const visibility = req.visibility
    return [
      {
        status: 'pending_approval',
        listingId: optionalString(req.listing_id),
        visibility: visibility === 'public' || visibility === 'private' ? visibility : undefined,
        businessName: typeof req.business_name === 'string' ? req.business_name : null,
        reason: optionalString(req.reason),
        message: optionalString(d.message),
      },
    ]
  }
  if (d.status === 'blocked') {
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

export function parseShareTokenRequest(data: unknown): ShareTokenRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const req = recordValue(d.request)
  if (d.status === 'pending_approval' && req) {
    return [
      {
        status: 'pending_approval',
        listingId: optionalString(req.listing_id),
        expiresInDays: typeof req.expires_in_days === 'number' ? req.expires_in_days : null,
        maxUses: typeof req.max_uses === 'number' ? req.max_uses : null,
        label: typeof req.label === 'string' ? req.label : null,
        businessName: typeof req.business_name === 'string' ? req.business_name : null,
        reason: optionalString(req.reason),
        message: optionalString(d.message),
      },
    ]
  }
  if (d.status === 'blocked') {
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

export function parseShareTokenRevokeRequest(data: unknown): ShareTokenRevokeRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const req = recordValue(d.request)
  if (d.status === 'pending_approval' && req) {
    return [
      {
        status: 'pending_approval',
        listingId: optionalString(req.listing_id),
        tokenId: optionalString(req.token_id),
        tokenHint: typeof req.token_hint === 'string' ? req.token_hint : null,
        tokenLabel: typeof req.token_label === 'string' ? req.token_label : null,
        businessName: typeof req.business_name === 'string' ? req.business_name : null,
        reason: optionalString(req.reason),
        message: optionalString(d.message),
      },
    ]
  }
  if (d.status === 'blocked') {
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

export function parseValuationMethodPreferenceRequest(
  data: unknown
): ValuationMethodPreferenceRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const req = recordValue(d.request)
  if (d.status === 'pending_approval' && req) {
    const method = req.method === null ? null : optionalString(req.method)
    return [
      {
        status: 'pending_approval',
        clientId: optionalString(req.client_id),
        method,
        businessName: typeof req.business_name === 'string' ? req.business_name : null,
        reason: optionalString(req.reason),
        message: optionalString(d.message),
      },
    ]
  }
  if (d.status === 'blocked') {
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

export function parseListingFieldUpdateRequest(
  data: unknown
): ListingFieldUpdateRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const req = recordValue(d.request)
  if (d.status === 'pending_approval' && req) {
    const rawChange = recordValue(req.change) ?? {}
    const change: ListingFieldUpdateRequest['change'] = {}
    if ('title' in rawChange) {
      const v = rawChange.title
      if (v === null) change.title = null
      else if (typeof v === 'string') change.title = v
    }
    if ('summary' in rawChange) {
      const v = rawChange.summary
      if (v === null) change.summary = null
      else if (typeof v === 'string') change.summary = v
    }
    if ('description' in rawChange) {
      const v = rawChange.description
      if (v === null) change.description = null
      else if (typeof v === 'string') change.description = v
    }
    if ('asking_price' in rawChange) {
      const v = rawChange.asking_price
      if (v === null) change.asking_price = null
      else if (typeof v === 'number' && Number.isFinite(v)) change.asking_price = v
    }
    return [
      {
        status: 'pending_approval',
        listingId: optionalString(req.listing_id),
        change,
        reason: optionalString(req.reason),
        message: optionalString(d.message),
      },
    ]
  }
  if (d.status === 'blocked') {
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

export function parseBulkValuationRunRequest(
  data: unknown
): BulkValuationRunRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const req = recordValue(d.request)
  if (d.status === 'pending_approval' && req) {
    const ids = Array.isArray(req.client_ids)
      ? req.client_ids.filter((v): v is string => typeof v === 'string' && v.length > 0)
      : undefined
    return [
      {
        status: 'pending_approval',
        clientIds: ids,
        clientCount:
          typeof req.client_count === 'number' ? req.client_count : ids?.length,
        estimatedCredits:
          typeof req.estimated_credits === 'number' ? req.estimated_credits : undefined,
        rejectedCount:
          typeof req.rejected_count === 'number' && req.rejected_count > 0
            ? req.rejected_count
            : undefined,
        reason: optionalString(req.reason),
        message: optionalString(d.message),
      },
    ]
  }
  if (d.status === 'blocked') {
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

export function parseValuationDefaultsRequest(
  data: unknown
): ValuationDefaultsRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const req = recordValue(d.request)
  if (d.status === 'pending_approval' && req) {
    const rawChange = recordValue(req.change) ?? {}
    const change: ValuationDefaultsRequest['change'] = {}
    if ('multiple_calibration_adjustment' in rawChange) {
      const v = rawChange.multiple_calibration_adjustment
      if (v === null) change.multiple_calibration_adjustment = null
      else if (typeof v === 'number' && Number.isFinite(v))
        change.multiple_calibration_adjustment = v
    }
    if ('historical_ebitda_weighting_mode' in rawChange) {
      const v = rawChange.historical_ebitda_weighting_mode
      if (v === null) change.historical_ebitda_weighting_mode = null
      else if (v === 'standard' || v === 'weighted')
        change.historical_ebitda_weighting_mode = v
    }
    if ('show_enterprise_to_equity_bridge' in rawChange) {
      const v = rawChange.show_enterprise_to_equity_bridge
      if (v === null) change.show_enterprise_to_equity_bridge = null
      else if (typeof v === 'boolean') change.show_enterprise_to_equity_bridge = v
    }
    return [
      {
        status: 'pending_approval',
        change,
        reason: optionalString(req.reason),
        message: optionalString(d.message),
      },
    ]
  }
  if (d.status === 'blocked') {
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

export function parseValuationDefaultsPreview(
  data: unknown
): ValuationDefaultsPreview[] {
  const d = recordValue(data)
  if (!d) return []
  if (d.status === 'ok') {
    const rawDefaults = recordValue(d.defaults) ?? {}
    const adj = rawDefaults.multiple_calibration_adjustment
    const weighting = rawDefaults.historical_ebitda_weighting_mode
    const bridge = rawDefaults.show_enterprise_to_equity_bridge
    return [
      {
        status: 'ok',
        defaults: {
          multiple_calibration_adjustment:
            typeof adj === 'number' && Number.isFinite(adj) ? adj : null,
          historical_ebitda_weighting_mode:
            weighting === 'standard' || weighting === 'weighted' ? weighting : null,
          show_enterprise_to_equity_bridge:
            typeof bridge === 'boolean' ? bridge : null,
        },
        allDefaultsAtSystem:
          typeof d.all_defaults_at_system === 'boolean'
            ? d.all_defaults_at_system
            : undefined,
        message: optionalString(d.message),
      },
    ]
  }
  if (d.status === 'failed') {
    return [
      {
        status: 'failed',
        message: optionalString(d.message),
      },
    ]
  }
  return []
}

export function parseAcknowledgeWarningRequest(data: unknown): AcknowledgeWarningRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const req = recordValue(d.request)
  if (d.status === 'pending_approval' && req) {
    const kind = req.kind
    return [
      {
        status: 'pending_approval',
        code: optionalString(req.code),
        warningKind: kind === 'cap_breach' || kind === 'defensibility' ? kind : undefined,
        summary: typeof req.summary === 'string' ? req.summary : null,
        reason: optionalString(req.reason),
        message: optionalString(d.message),
        clientId: optionalString(req.client_id),
        reportId: optionalString(req.report_id),
      },
    ]
  }
  if (d.status === 'blocked') {
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

export function parseSecureCredentialRequest(data: unknown): SecureCredentialRequest[] {
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

export function parseCsvUploadRequest(data: unknown): CsvUploadRequest[] {
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

export function parseMultiSelectRequest(data: unknown): MultiSelectRequest[] {
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

export function parseSingleSelectRequest(data: unknown): SingleSelectRequest[] {
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

export function parseClientCreateRequest(data: unknown): ClientCreateRequest[] {
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

export function parseValuationSessionRequest(data: unknown): ValuationSessionRequest[] {
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

export function parseImportReviewRequest(data: unknown): ImportReviewRequest[] {
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

export function parseClientDataReadiness(data: unknown): ClientDataReadinessPreview[] {
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

export function parseMethodReadiness(data: unknown): MethodReadinessPreview[] {
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

export function parseBelgianCompanyBootstrap(data: unknown): BelgianCompanyBootstrap[] {
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

export function parseListingPreview(data: unknown): ListingPreview[] {
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

export function parseBuyerProfilePreview(data: unknown): BuyerProfilePreview[] {
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
