import type { ValuationResponse } from '../types/valuation'
import { generalLogger } from './logger'

/**
 * POST anonymized sector multiples to Titan give-to-get endpoint.
 * GDPR-safe aggregate metrics only — no company names or PII.
 */
export async function submitAnonymizedBenchmarkContribution(
  result: ValuationResponse
): Promise<void> {
  const businessTypeId = result.business_type || result.industry
  const valuationResults = result.valuation_results

  let evEbitda: number | null = null
  let evRevenue: number | null = null

  if (valuationResults) {
    const ebitdaMethod = (valuationResults as Record<string, unknown>)?.ebitda_multiple as
      | { enterprise_value?: number; ebitda?: number }
      | undefined
    if (ebitdaMethod?.enterprise_value && ebitdaMethod?.ebitda) {
      evEbitda = +(ebitdaMethod.enterprise_value / ebitdaMethod.ebitda).toFixed(2)
    }

    const revenueMethod = (valuationResults as Record<string, unknown>)?.revenue_multiple as
      | { enterprise_value?: number; revenue?: number }
      | undefined
    if (revenueMethod?.enterprise_value && revenueMethod?.revenue) {
      evRevenue = +(revenueMethod.enterprise_value / revenueMethod.revenue).toFixed(2)
    }
  }

  const row = result as unknown as Record<string, unknown>
  const titanUrl = process.env.NEXT_PUBLIC_TITAN_API_URL || ''
  const ebitda = row.ebitda != null ? Number(row.ebitda) : null
  const revenue = row.revenue != null ? Number(row.revenue) : null

  if (!titanUrl || !businessTypeId) {
    return
  }

  const hasContributionData =
    (evEbitda != null && ebitda != null && Number.isFinite(ebitda)) ||
    (evRevenue != null && revenue != null && Number.isFinite(revenue))
  if (!hasContributionData) {
    generalLogger.info('Skipping anonymized benchmark contribution (incomplete valuation payload)', {
      businessType: businessTypeId,
      hasValuationResults: !!valuationResults,
    })
    return
  }

  const res = await fetch(`${titanUrl}/api/v2/multiples/contribute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_type_id: businessTypeId,
      country_code: (row.country_code as string) || 'XX',
      enterprise_value: evEbitda != null && ebitda != null ? evEbitda * ebitda : null,
      ebitda,
      revenue,
      observation_type: 'CLOSED_DEAL',
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Contribution failed: ${res.status} ${text.slice(0, 200)}`)
  }

  generalLogger.info('Anonymized benchmark contribution submitted', {
    businessType: businessTypeId,
  })
}
