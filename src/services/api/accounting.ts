/**
 * Accounting Integrations API
 *
 * Fetches financial data from connected accounting software via Titan.
 * Used for one-click prefill in the valuation manual input flow.
 */

import axios from 'axios'

import { getLastFullFiscalYear } from '../../utils/fiscalYear'
import { HttpClient } from './HttpClient'

export interface AccountingFinancialPayload {
  data: {
    revenue: number
    ebitda?: number
    cost_of_goods_sold?: number
    operating_expenses?: number
    fiscal_year: number
    [key: string]: unknown
  }
  source: string
  synced_at?: string
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
 * Venus manual-flow import: **Yuki and Exact only** (Hermes-backed).
 * Titan may still report QuickBooks/Xero in `GET /integrations/accounting/status`; we ignore them here
 * so test environments never surface mock QB/Xero financials in this UI.
 */
export const ACCOUNTING_IMPORT_PROVIDER_ORDER = ['yuki', 'exact'] as const

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
export function pickConnectedImportStatus(
  statuses: IntegrationStatus[]
): IntegrationStatus | null {
  const byProvider = new Map(statuses.map((s) => [s.provider, s]))
  for (const p of ACCOUNTING_IMPORT_PROVIDER_ORDER) {
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
    default:
      return provider
  }
}

class AccountingAPI extends HttpClient {
  async getAllIntegrationStatus(): Promise<IntegrationStatus[]> {
    const response = await this.client.get<IntegrationStatus[]>('/integrations/accounting/status')
    return response.data
  }

  async getProviderFinancialData(
    provider: AccountingImportProvider,
    fiscalYear?: number
  ): Promise<AccountingFinancialPayload> {
    const year = fiscalYear ?? getLastFullFiscalYear()
    const response = await this.client.get<AccountingFinancialPayload>(
      `/integrations/accounting/${provider}/financial-data`,
      { params: { fiscal_year: year } }
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
