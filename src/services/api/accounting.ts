/**
 * Accounting Integrations API
 *
 * Fetches financial data from connected accounting software via Titan.
 * Used for one-click prefill in the valuation manual input flow.
 */

import axios from 'axios'

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

/** Order matches product priority: Benelux-first, then global placeholders. */
export const ACCOUNTING_IMPORT_PROVIDER_ORDER = [
  'yuki',
  'exact',
  'quickbooks',
  'xero',
] as const

export type AccountingImportProvider = (typeof ACCOUNTING_IMPORT_PROVIDER_ORDER)[number]

export function pickConnectedImportProvider(
  statuses: IntegrationStatus[]
): AccountingImportProvider | null {
  const s = pickConnectedImportStatus(statuses)
  return s ? (s.provider as AccountingImportProvider) : null
}

/** Full status row for the chosen provider (for UI subtitle: company name, etc.). */
export function pickConnectedImportStatus(
  statuses: IntegrationStatus[]
): IntegrationStatus | null {
  const byProvider = new Map(statuses.map((s) => [s.provider, s]))
  for (const p of ACCOUNTING_IMPORT_PROVIDER_ORDER) {
    const row = byProvider.get(p)
    if (row?.is_connected) {
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
    case 'quickbooks':
      return 'QuickBooks'
    case 'xero':
      return 'Xero'
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
    const year = fiscalYear ?? new Date().getFullYear()
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
    const raw = err.response?.data
    if (raw && typeof raw === 'object') {
      const data = raw as { message?: unknown }
      const m = data.message
      if (typeof m === 'string' && m.length > 0) return m
      if (Array.isArray(m)) return m.filter(Boolean).join(', ')
    }
  }
  if (err instanceof Error) return err.message
  return 'Failed to import'
}
