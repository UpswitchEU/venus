import {
  optionalString,
  optionalStringList,
  pendingRequest,
  recordValue,
} from './tool-result-parser-utils'
import type {
  AcknowledgeWarningRequest,
  BelgianCompanyBootstrap,
  BulkValuationRunRequest,
  BuyerProfilePreview,
  ClientCreateRequest,
  ClientDataReadinessPreview,
  CsvUploadRequest,
  ImportReviewRequest,
  ImportReviewRequestPending,
  IntegrationConnectRequest,
  IntegrationSyncRequest,
  ListingFieldUpdateRequest,
  ListingPreview,
  ListingVisibilityRequest,
  MethodReadinessPreview,
  MultiSelectRequest,
  NormalizationDismissRequest,
  OwnerProfileAnswerRequest,
  OwnerReminderRequest,
  SecureCredentialRequest,
  ShareTokenRequest,
  ShareTokenRevokeRequest,
  SingleSelectRequest,
  ValuationDefaultsPreview,
  ValuationDefaultsRequest,
  ValuationMethodPreferenceRequest,
  ValuationSessionRequest,
  WorkspaceClientsPreview,
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

type BlockedApprovalRequest = {
  status: 'blocked'
  reason?: string
  message?: string
}

function buildBlockedApprovalRequest<T extends BlockedApprovalRequest>(
  data: Record<string, unknown>
): T {
  return {
    status: 'blocked',
    reason: optionalString(data.reason),
    message: optionalString(data.message),
  } as T
}

function parsePendingApprovalOrBlocked<T extends { status: 'pending_approval' | 'blocked' }>(
  data: unknown,
  buildPending: (data: Record<string, unknown>, request: Record<string, unknown>) => T
): T[] {
  const d = recordValue(data)
  if (!d) return []

  const req = pendingRequest(d)
  if (req) return [buildPending(d, req)]

  if (d.status === 'blocked') {
    return [buildBlockedApprovalRequest<T & BlockedApprovalRequest>(d) as T]
  }

  return []
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
  if (!d) return []
  const req = pendingRequest(d)
  if (!req) return []

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
  return parsePendingApprovalOrBlocked<IntegrationSyncRequest>(data, (d, req) => {
    const scope = req.scope
    return {
      status: 'pending_approval',
      provider: optionalString(req.provider),
      scope: scope === 'provider_scope' || scope === 'client_scope' ? scope : undefined,
      clientId: typeof req.client_id === 'string' ? req.client_id : null,
      reason: optionalString(req.reason),
      message: optionalString(d.message),
    }
  })
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
  return parsePendingApprovalOrBlocked<import('./tool-result-types').OwnerInviteAccountantRequest>(
    data,
    (d, req) => ({
      status: 'pending_approval',
      accountantEmail: optionalString(req.accountant_email),
      customMessage: typeof req.custom_message === 'string' ? req.custom_message : null,
      reason: optionalString(req.reason),
      message: optionalString(d.message),
    })
  )
}

export function parseOwnerReminderRequest(data: unknown): OwnerReminderRequest[] {
  return parsePendingApprovalOrBlocked<OwnerReminderRequest>(data, (d, req) => ({
    status: 'pending_approval',
    clientId: optionalString(req.client_id),
    businessName: typeof req.business_name === 'string' ? req.business_name : null,
    customerEmail: typeof req.customer_email === 'string' ? req.customer_email : null,
    customMessage: typeof req.custom_message === 'string' ? req.custom_message : null,
    reason: optionalString(req.reason),
    message: optionalString(d.message),
  }))
}

export function parseListingVisibilityRequest(data: unknown): ListingVisibilityRequest[] {
  return parsePendingApprovalOrBlocked<ListingVisibilityRequest>(data, (d, req) => {
    const visibility = req.visibility
    return {
      status: 'pending_approval',
      listingId: optionalString(req.listing_id),
      visibility: visibility === 'public' || visibility === 'private' ? visibility : undefined,
      businessName: typeof req.business_name === 'string' ? req.business_name : null,
      reason: optionalString(req.reason),
      message: optionalString(d.message),
    }
  })
}

export function parseShareTokenRequest(data: unknown): ShareTokenRequest[] {
  return parsePendingApprovalOrBlocked<ShareTokenRequest>(data, (d, req) => ({
    status: 'pending_approval',
    listingId: optionalString(req.listing_id),
    expiresInDays: typeof req.expires_in_days === 'number' ? req.expires_in_days : null,
    maxUses: typeof req.max_uses === 'number' ? req.max_uses : null,
    label: typeof req.label === 'string' ? req.label : null,
    businessName: typeof req.business_name === 'string' ? req.business_name : null,
    reason: optionalString(req.reason),
    message: optionalString(d.message),
  }))
}

export function parseShareTokenRevokeRequest(data: unknown): ShareTokenRevokeRequest[] {
  return parsePendingApprovalOrBlocked<ShareTokenRevokeRequest>(data, (d, req) => ({
    status: 'pending_approval',
    listingId: optionalString(req.listing_id),
    tokenId: optionalString(req.token_id),
    tokenHint: typeof req.token_hint === 'string' ? req.token_hint : null,
    tokenLabel: typeof req.token_label === 'string' ? req.token_label : null,
    businessName: typeof req.business_name === 'string' ? req.business_name : null,
    reason: optionalString(req.reason),
    message: optionalString(d.message),
  }))
}

export function parseValuationMethodPreferenceRequest(
  data: unknown
): ValuationMethodPreferenceRequest[] {
  return parsePendingApprovalOrBlocked<ValuationMethodPreferenceRequest>(data, (d, req) => {
    const method = req.method === null ? null : optionalString(req.method)
    return {
      status: 'pending_approval',
      clientId: optionalString(req.client_id),
      method,
      businessName: typeof req.business_name === 'string' ? req.business_name : null,
      reason: optionalString(req.reason),
      message: optionalString(d.message),
    }
  })
}

export function parseNormalizationDismissRequest(data: unknown): NormalizationDismissRequest[] {
  return parsePendingApprovalOrBlocked<NormalizationDismissRequest>(data, (d, req) => ({
    status: 'pending_approval',
    reportId: optionalString(req.report_id),
    adjustmentId: optionalString(req.adjustment_id),
    category: optionalString(req.category),
    amount: typeof req.amount === 'number' && Number.isFinite(req.amount) ? req.amount : null,
    reason: optionalString(req.reason),
    message: optionalString(d.message),
  }))
}

export function parseListingFieldUpdateRequest(data: unknown): ListingFieldUpdateRequest[] {
  return parsePendingApprovalOrBlocked<ListingFieldUpdateRequest>(data, (d, req) => {
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
    return {
      status: 'pending_approval',
      listingId: optionalString(req.listing_id),
      change,
      reason: optionalString(req.reason),
      message: optionalString(d.message),
    }
  })
}

export function parseBulkValuationRunRequest(data: unknown): BulkValuationRunRequest[] {
  return parsePendingApprovalOrBlocked<BulkValuationRunRequest>(data, (d, req) => {
    const ids = Array.isArray(req.client_ids)
      ? req.client_ids.filter((v): v is string => typeof v === 'string' && v.length > 0)
      : undefined
    return {
      status: 'pending_approval',
      clientIds: ids,
      clientCount: typeof req.client_count === 'number' ? req.client_count : ids?.length,
      estimatedCredits:
        typeof req.estimated_credits === 'number' ? req.estimated_credits : undefined,
      rejectedCount:
        typeof req.rejected_count === 'number' && req.rejected_count > 0
          ? req.rejected_count
          : undefined,
      reason: optionalString(req.reason),
      message: optionalString(d.message),
    }
  })
}

export function parseValuationDefaultsRequest(data: unknown): ValuationDefaultsRequest[] {
  return parsePendingApprovalOrBlocked<ValuationDefaultsRequest>(data, (d, req) => {
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
      else if (v === 'standard' || v === 'weighted') change.historical_ebitda_weighting_mode = v
    }
    if ('show_enterprise_to_equity_bridge' in rawChange) {
      const v = rawChange.show_enterprise_to_equity_bridge
      if (v === null) change.show_enterprise_to_equity_bridge = null
      else if (typeof v === 'boolean') change.show_enterprise_to_equity_bridge = v
    }
    return {
      status: 'pending_approval',
      change,
      reason: optionalString(req.reason),
      message: optionalString(d.message),
    }
  })
}

export function parseWorkspaceClientsPreview(data: unknown): WorkspaceClientsPreview[] {
  const d = recordValue(data)
  if (!d) return []
  if (d.status === 'ok') {
    const rawList = Array.isArray(d.clients) ? d.clients : []
    const clients = rawList
      .map((entry) => {
        const row = recordValue(entry)
        if (!row || typeof row.id !== 'string' || typeof row.name !== 'string') return null
        const statusValue = row.status
        const safeStatus: 'draft' | 'invited' | 'active' =
          statusValue === 'draft' || statusValue === 'invited' || statusValue === 'active'
            ? statusValue
            : 'draft'
        return {
          id: row.id,
          name: row.name,
          email: typeof row.email === 'string' ? row.email : null,
          company_number: typeof row.company_number === 'string' ? row.company_number : null,
          status: safeStatus,
          invited_at: typeof row.invited_at === 'string' ? row.invited_at : null,
          accepted_at: typeof row.accepted_at === 'string' ? row.accepted_at : null,
        }
      })
      .filter((c): c is NonNullable<WorkspaceClientsPreview['clients']>[number] => c !== null)
    const counts = recordValue(d.counts) ?? {}
    const filter = recordValue(d.filter) ?? null
    const filterStatus =
      filter &&
      (filter.status === 'draft' || filter.status === 'invited' || filter.status === 'active')
        ? (filter.status as 'draft' | 'invited' | 'active')
        : null
    return [
      {
        status: 'ok',
        clients,
        totalClients: typeof d.total_clients === 'number' ? d.total_clients : undefined,
        returnedCount: typeof d.returned_count === 'number' ? d.returned_count : clients.length,
        truncated: d.truncated === true,
        counts: {
          draft: typeof counts.draft === 'number' ? counts.draft : 0,
          invited: typeof counts.invited === 'number' ? counts.invited : 0,
          active: typeof counts.active === 'number' ? counts.active : 0,
        },
        filter: filter
          ? {
              status: filterStatus,
              search: typeof filter.search === 'string' ? filter.search : null,
            }
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

export function parseValuationDefaultsPreview(data: unknown): ValuationDefaultsPreview[] {
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
          show_enterprise_to_equity_bridge: typeof bridge === 'boolean' ? bridge : null,
        },
        allDefaultsAtSystem:
          typeof d.all_defaults_at_system === 'boolean' ? d.all_defaults_at_system : undefined,
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
  return parsePendingApprovalOrBlocked<AcknowledgeWarningRequest>(data, (d, req) => {
    const kind = req.kind
    return {
      status: 'pending_approval',
      code: optionalString(req.code),
      warningKind: kind === 'cap_breach' || kind === 'defensibility' ? kind : undefined,
      summary: typeof req.summary === 'string' ? req.summary : null,
      reason: optionalString(req.reason),
      message: optionalString(d.message),
      clientId: optionalString(req.client_id),
      reportId: optionalString(req.report_id),
    }
  })
}

export function parseSecureCredentialRequest(data: unknown): SecureCredentialRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const req = pendingRequest(d)
  if (!req) return []

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
  if (!d) return []
  const req = pendingRequest(d)
  if (!req) return []

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
  if (!d) return []
  const req = pendingRequest(d)
  if (!req) return []
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
  if (!d) return []
  const req = pendingRequest(d)
  if (!req) return []
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
    const companyNumber = typeof req.company_number === 'string' ? req.company_number.trim() : ''
    if (!companyNumber) return []

    return [
      {
        status,
        businessName: optionalString(req.business_name),
        customerEmail: typeof req.customer_email === 'string' ? req.customer_email : null,
        companyNumber,
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
