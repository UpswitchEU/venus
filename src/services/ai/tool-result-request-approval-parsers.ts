import { optionalString, pendingRequest, recordValue } from './tool-result-parser-utils'
import type {
  AcknowledgeWarningRequest,
  BulkValuationRunRequest,
  IntegrationConnectRequest,
  IntegrationSyncRequest,
  ListingFieldUpdateRequest,
  ListingVisibilityRequest,
  NormalizationDismissRequest,
  OwnerInviteAccountantRequest,
  OwnerProfileAnswerRequest,
  OwnerReminderRequest,
  ShareTokenRequest,
  ShareTokenRevokeRequest,
  SyncStatusPreview,
  ValuationDefaultsRequest,
  ValuationMethodPreferenceRequest,
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

export function parseSyncStatus(data: unknown): SyncStatusPreview[] {
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

export function parseOwnerInviteAccountantRequest(data: unknown): OwnerInviteAccountantRequest[] {
  return parsePendingApprovalOrBlocked<OwnerInviteAccountantRequest>(data, (d, req) => ({
    status: 'pending_approval',
    accountantEmail: optionalString(req.accountant_email),
    customMessage: typeof req.custom_message === 'string' ? req.custom_message : null,
    reason: optionalString(req.reason),
    message: optionalString(d.message),
  }))
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
