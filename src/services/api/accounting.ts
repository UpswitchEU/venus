/**
 * Accounting Integrations API
 *
 * Fetches financial data from connected accounting software (Yuki) via Titan.
 * Used for "Import from Yuki" prefill in the valuation form.
 */

import { HttpClient } from './HttpClient'

export interface YukiFinancialData {
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

class AccountingAPI extends HttpClient {
  async getYukiFinancialData(fiscalYear?: number): Promise<YukiFinancialData> {
    const year = fiscalYear ?? new Date().getFullYear()
    const response = await this.client.get<YukiFinancialData>(
      `/integrations/accounting/yuki/financial-data`,
      { params: { fiscal_year: year } }
    )
    return response.data
  }
}

export const accountingAPI = new AccountingAPI()
