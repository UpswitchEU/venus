import { optionalString, recordValue } from './tool-result-parser-utils'
import type {
  ClientCreateRequest,
  ImportReviewRequest,
  ImportReviewRequestPending,
  ValuationDefaultsPreview,
  ValuationSessionRequest,
  WorkspaceClientsPreview,
} from './tool-result-types'

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
