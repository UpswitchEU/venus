/**
 * Accounting Integrations API
 *
 * Fetches financial data from connected accounting software via Titan.
 *
 * **Prefill architecture:** Mercury + Hermes ingest; Titan persists. Venus autofills from **stored**
 * session/bootstrap payloads (`historical_years_data`, `importQuality`, `_imported_ledger_analysis`).
 * Titan financial-data routes exist for Mercury/sync and tooling; they are not a parallel “Venus-only”
 * source of truth for first-time ingestion.
 */

import axios from 'axios'

import { getCurrentFilingYear } from '../../utils/fiscalYear'
import { HttpClient } from './HttpClient'

export interface AccountingFinancialPayload {
  data: {
    revenue: number
    ebitda?: number
    cost_of_goods_sold?: number
    operating_expenses?: number
    depreciation?: number
    cash_and_equivalents?: number
    long_term_debt?: number
    short_term_financial_debt?: number
    sde_flags?: AccountingSdeFlag[]
    ev_equity_bridge?: EvEquityBridge
    fiscal_year: number
    [key: string]: unknown
  }
  source: string
  synced_at?: string
  quality_score?: number
  import_quality?: AccountingImportQuality
}

export interface AccountingImportQuality {
  confidence_score: number
  audit_flags: Array<{
    field: string
    code: string
    severity: 'error' | 'warning' | 'info'
    message: string
    source_accounts: string[]
    fiscal_year?: number | null
  }>
}

export interface AccountingSdeFlag {
  ledger_code: string
  ledger_name: string
  amount: number
  deviation_pct: number
  benchmark_median_pct: number
  benchmark_std_pct?: number
  actual_pct_of_revenue?: number
  z_score?: number
  confidence?: number
  year?: number
  potential_sde_addback: boolean
  suggested_question: string
  rationale?: string
  category?: string
  /**
   * Heuristic default share (% of `amount`) considered private spending and
   * therefore an SDE add-back. The Venus normalization modal pre-fills a
   * slider with this value so accountants don't have to estimate from zero.
   */
  default_private_use_pct?: number
  suggested_addback_amount?: number
}

export interface EvEquityBridge {
  enterprise_value: number
  cash_and_equivalents: number
  long_term_debt: number
  short_term_financial_debt: number
  interest_bearing_debt: number
  net_debt: number
  equity_value: number
}

export interface AccountingForecastYearBatchRow {
  year: number
  revenue: number
  ebitda?: number
  capex?: number
  is_forecast?: boolean
}

export interface AccountingBatchPayload {
  years: AccountingFinancialPayload[]
  latest_fiscal_year?: number
  sde_flags?: AccountingSdeFlag[]
  ev_equity_bridge?: EvEquityBridge
  dcf_defaults?: {
    average_depreciation: number
    suggested_capex: number
  }
  /** DCF projection years from provider budgets (e.g. Bizzcontrol). */
  forecast_years_data?: AccountingForecastYearBatchRow[]
  dcf_projections_from_provider?: boolean
}

export interface AccountingConnectResponse {
  success: boolean
  message: string
  connection_id?: string
}

export interface AccountingAdministration {
  administration_id: string
  name: string
}

export interface AccountingAdministrationListResponse {
  administrations: AccountingAdministration[]
  connection_id: string
}

export interface IntegrationStatus {
  provider: string
  is_connected: boolean
  company_name?: string
  company_id?: string
  last_sync_at?: string
  expires_at?: string
}

/**
 * Order for `pickConnectedImportStatus` when the UI needs “which integration badge to show” or
 * optional recovery navigation to Mercury. **Primary** valuation prefill is Titan **stored**
 * session/bootstrap after Mercury sync (see file header). QuickBooks/Xero in
 * `GET /integrations/accounting/status` are ignored for this picker where mock data must not appear.
 */
export const ACCOUNTING_IMPORT_PROVIDER_ORDER = [
  'silverfin',
  'bizzcontrol',
  'octopus',
  'yuki',
  'exact',
] as const

export type AccountingImportProvider = (typeof ACCOUNTING_IMPORT_PROVIDER_ORDER)[number]

export function isAccountingImportProvider(p: string): p is AccountingImportProvider {
  return (ACCOUNTING_IMPORT_PROVIDER_ORDER as readonly string[]).includes(p)
}

export function pickConnectedImportProvider(
  statuses: IntegrationStatus[]
): AccountingImportProvider | null {
  const s = pickConnectedImportStatus(statuses)
  return s && isAccountingImportProvider(s.provider) ? s.provider : null
}

/** Full status row for the chosen provider (for UI subtitle: company name, etc.). */
export function pickConnectedImportStatus(statuses: IntegrationStatus[]): IntegrationStatus | null {
  const byProvider = new Map(statuses.map((s) => [s.provider, s]))
  for (const p of ACCOUNTING_IMPORT_PROVIDER_ORDER) {
    const row = byProvider.get(p)
    if (row?.is_connected && isAccountingImportProvider(row.provider)) {
      return row
    }
  }
  return null
}

/** Providers that support in-app trial-balance batch import in Venus (`ManualInputPanel`). */
export const VENUS_BATCH_IMPORT_PROVIDER_ORDER = ['bizzcontrol', 'octopus'] as const

/**
 * Pick a connected Bizzcontrol or Octopus row for Venus batch import — **not** the global
 * `pickConnectedImportStatus` order (which prioritizes Silverfin). Use this when the UI opens
 * the Bizzcontrol/Octopus import modals so a Mercury-primary Silverfin connection does not hide
 * a co-connected pull provider.
 */
export function pickConnectedVenusBatchImportStatus(
  statuses: IntegrationStatus[]
): IntegrationStatus | null {
  const byProvider = new Map(statuses.map((s) => [s.provider, s]))
  for (const p of VENUS_BATCH_IMPORT_PROVIDER_ORDER) {
    const row = byProvider.get(p)
    if (row?.is_connected && isAccountingImportProvider(row.provider)) {
      return row
    }
  }
  return null
}

export function accountingProviderDisplayName(provider: string): string {
  switch (provider) {
    case 'yuki':
      return 'Yuki'
    case 'exact':
      return 'Exact Online'
    case 'silverfin':
      return 'Silverfin'
    case 'bizzcontrol':
      return 'Bizzcontrol'
    case 'octopus':
      return 'Octopus'
    default:
      return provider
  }
}

class AccountingAPI extends HttpClient {
  async connectYuki(apiKey: string, administrationId?: string): Promise<AccountingConnectResponse> {
    const response = await this.client.post<AccountingConnectResponse>(
      '/integrations/accounting/yuki/connect',
      {
        api_key: apiKey,
        administration_id: administrationId || undefined,
      }
    )
    return response.data
  }

  async getAllIntegrationStatus(): Promise<IntegrationStatus[]> {
    const response = await this.client.get<IntegrationStatus[]>('/integrations/accounting/status')
    return response.data
  }

  async getSilverfinAuthorizeUrl(
    redirectUri: string,
    state?: string
  ): Promise<{ authorization_url: string }> {
    const qs = new URLSearchParams({ redirect_uri: redirectUri })
    if (state) {
      qs.set('state', state)
    }
    const response = await fetch(
      `/api/integrations/accounting/silverfin/authorize?${qs.toString()}`,
      {
        credentials: 'include',
      }
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(
        (data as { message?: string }).message || 'Failed to get Silverfin authorize URL'
      )
    }
    return data as { authorization_url: string }
  }

  async connectSilverfin(
    code: string,
    redirectUri: string,
    firmId: string
  ): Promise<AccountingConnectResponse> {
    const response = await fetch('/api/integrations/accounting/silverfin/callback', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        redirect_uri: redirectUri,
        firm_id: firmId,
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((data as { message?: string }).message || 'Failed to connect Silverfin')
    }
    return data as AccountingConnectResponse
  }

  async getSilverfinCompanies(): Promise<AccountingAdministrationListResponse> {
    const response = await this.client.get<AccountingAdministrationListResponse>(
      '/integrations/accounting/silverfin/companies'
    )
    return response.data
  }

  async disconnectSilverfin(): Promise<void> {
    const response = await fetch('/api/integrations/accounting/silverfin/disconnect', {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!response.ok && response.status !== 204) {
      const data = await response.json().catch(() => ({}))
      throw new Error((data as { message?: string }).message || 'Failed to disconnect Silverfin')
    }
  }

  /**
   * One fiscal year from Titan for Yuki or Exact **after** Mercury sync (stored financials).
   * This is `GET /{provider}/financial-data`, not multi-year batch. Silverfin multi-year
   * import in-app uses {@link getSilverfinFinancialDataBatch} only; Exact batch import was removed from Venus.
   */
  async getProviderFinancialData(
    provider: AccountingImportProvider,
    fiscalYear?: number
  ): Promise<AccountingFinancialPayload> {
    const year = fiscalYear ?? getCurrentFilingYear()
    const response = await this.client.get<AccountingFinancialPayload>(
      `/integrations/accounting/${provider}/financial-data`,
      { params: { fiscal_year: year } }
    )
    return response.data
  }

  /**
   * Multi-year batch import (live in Venus). See also {@link getBizzcontrolFinancialDataBatch}
   * and {@link getOctopusFinancialDataBatch}.
   */
  async getSilverfinFinancialDataBatch(
    startYear: number,
    endYear: number,
    options: { companyId: string }
  ): Promise<AccountingBatchPayload> {
    const response = await this.client.get<AccountingBatchPayload>(
      '/integrations/accounting/silverfin/financial-data/batch',
      {
        params: {
          start_year: startYear,
          end_year: endYear,
          company_id: options.companyId,
        },
      }
    )
    return response.data
  }

  async getBizzcontrolFinancialDataBatch(
    startYear: number,
    endYear: number,
    options: { companyId: string }
  ): Promise<AccountingBatchPayload> {
    const response = await this.client.get<AccountingBatchPayload>(
      '/integrations/accounting/bizzcontrol/financial-data/batch',
      {
        params: {
          start_year: startYear,
          end_year: endYear,
          company_id: options.companyId,
        },
      }
    )
    return response.data
  }

  async getBizzcontrolCompanies(): Promise<AccountingAdministrationListResponse> {
    const response = await this.client.get<AccountingAdministrationListResponse>(
      '/integrations/accounting/bizzcontrol/companies'
    )
    return response.data
  }

  async getOctopusFinancialDataBatch(
    startYear: number,
    endYear: number,
    options: { companyId: string }
  ): Promise<AccountingBatchPayload> {
    const response = await this.client.get<AccountingBatchPayload>(
      '/integrations/accounting/octopus/financial-data/batch',
      {
        params: {
          start_year: startYear,
          end_year: endYear,
          company_id: options.companyId,
        },
      }
    )
    return response.data
  }

  async getOctopusCompanies(): Promise<AccountingAdministrationListResponse> {
    const response = await this.client.get<AccountingAdministrationListResponse>(
      '/integrations/accounting/octopus/companies'
    )
    return response.data
  }

  /** @deprecated Use getProviderFinancialData after status preflight */
  async getYukiFinancialData(fiscalYear?: number): Promise<AccountingFinancialPayload> {
    return this.getProviderFinancialData('yuki', fiscalYear)
  }
}

export const accountingAPI = new AccountingAPI()

/** Normalize Titan/Nest error bodies for display (422, validation, etc.). */
export function parseAccountingApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    const raw = err.response?.data
    if (raw && typeof raw === 'object') {
      const data = raw as { message?: unknown; code?: string }
      const m = data.message
      if (typeof m === 'string' && m.length > 0) return m
      if (Array.isArray(m)) return m.filter(Boolean).join(', ')
      if (data.code === 'ACCOUNTING_INTEGRATION_NOT_CONNECTED') {
        return 'Connect your accounting software in Settings first.'
      }
    }
    if (status === 422 || status === 404) {
      return 'Could not import accounting data. Check your connection in Settings.'
    }
    if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
      return 'Network error. Check your connection and try again.'
    }
  }
  if (err instanceof Error) {
    const msg = err.message
    if (msg === 'Network Error' || msg.includes('ERR_NETWORK')) {
      return 'Network error. Check your connection and try again.'
    }
    return msg
  }
  return 'Failed to import'
}
