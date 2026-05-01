import type { ValuationResponse } from '../types/valuation'
import { generalLogger } from './logger'

const RISK_LEVELS = new Set(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
const METHODOLOGY_TOKENS = new Set([
  'MULTIPLES',
  'SDE',
  'HYBRID',
  'DCF',
  'ASSET',
  'STARTUP',
  'UNKNOWN',
])

/**
 * Extract DATA-1 owner-profile fields from a valuation response, if present.
 *
 * Mirrors `Pick<ValuationResponse, 'owner_dependency_result' |
 * 'owner_dependency_adjustment'>` from `coverChip.ts` but emits the wire shape
 * that Titan's `MultiplesContributionDto` accepts (DATA-1 fields). Per
 * SPIKE-1 §5.4 R8 we forward the CAPPED `owner_dependency_adjustment`
 * (the figure that scaled equity), never the engine raw output — Delphi's
 * k-anon view uses this to compute sector medians, so leaking the raw
 * figure here would make benchmarks understate the cap effect.
 *
 * Returns `null` if no owner-profile data is on the response — the caller
 * just omits these fields from the payload.
 */
function extractOwnerProfileFields(
  result: ValuationResponse,
): null | {
  transferability_risk_index?: number
  owner_dependency_adjustment?: number
  owner_profiling_risk_level?: string
  valuation_methodology?: string
} {
  const row = result as unknown as Record<string, unknown>
  const odr = row.owner_dependency_result as
    | {
        overall_score?: number | string
        risk_level?: string
        valuation_adjustment?: number | string
      }
    | undefined
  const appliedAdj = row.owner_dependency_adjustment as number | string | undefined

  // Methodology — derive from `valuation_methodology` enum string when
  // present; the FE does not own the canonical token list, so we only
  // forward values that match the Titan/Delphi enum exactly.
  const methodologyRaw = (row.valuation_methodology as string | undefined) ?? null
  const methodology =
    methodologyRaw && METHODOLOGY_TOKENS.has(methodologyRaw.toUpperCase())
      ? methodologyRaw.toUpperCase()
      : null

  if (!odr || appliedAdj == null) {
    // Methodology alone (no owner-profile result) is informationally weak;
    // omit to avoid slowing the cohort with rows that the k-anon view
    // discards anyway (gate 2 requires owner_dep IS NOT NULL).
    return null
  }

  const overall = Number(odr.overall_score)
  if (!Number.isFinite(overall)) return null
  const triRaw = 100 - Math.max(0, Math.min(100, Math.round(overall)))
  const tri = Math.max(0, Math.min(100, triRaw))

  // The applied adjustment is the CAPPED figure; clamp defensively into
  // the [-0.40, 0.00] band the DTO + DB CHECK constraints require.
  const adj = Number(appliedAdj)
  if (!Number.isFinite(adj)) return null
  const adjBounded = Math.max(-0.4, Math.min(0, adj))

  const riskLevel = typeof odr.risk_level === 'string' ? odr.risk_level.toUpperCase() : null
  const riskLevelBounded =
    riskLevel && RISK_LEVELS.has(riskLevel) ? riskLevel : null

  const out: {
    transferability_risk_index: number
    owner_dependency_adjustment: number
    owner_profiling_risk_level?: string
    valuation_methodology?: string
  } = {
    transferability_risk_index: tri,
    owner_dependency_adjustment: +adjBounded.toFixed(3),
  }
  if (riskLevelBounded) out.owner_profiling_risk_level = riskLevelBounded
  if (methodology) out.valuation_methodology = methodology
  return out
}

/**
 * POST anonymized sector multiples to Titan give-to-get endpoint.
 * GDPR-safe aggregate metrics only — no company names or PII.
 *
 * DATA-1 enrichment: when the response carries an
 * `owner_dependency_result`, the contribution is enriched with the
 * transferability_risk_index, capped owner_dependency_adjustment, risk
 * band, and methodology token. These fields drive Delphi's owner-profile
 * benchmarks materialized view (k-anon gate N>=5).
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

  const ownerProfileFields = extractOwnerProfileFields(result)

  // DATA-1 idempotency: pin the contribution to the originating valuation.
  // A retry, hot-reload, or user navigation back to the report must NOT
  // double-count in Delphi's k-anon cohort — the partial unique index in
  // migration 064 enforces this server-side, and Titan returns a clean
  // `status: "deduplicated"` 200 instead of a noisy P2002.
  const valuationId = typeof row.valuation_id === 'string' ? row.valuation_id : null
  const contributorReference = valuationId
    ? valuationId.slice(0, 128)
    : undefined

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
      ...(ownerProfileFields ?? {}),
      ...(contributorReference ? { contributor_reference: contributorReference } : {}),
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Contribution failed: ${res.status} ${text.slice(0, 200)}`)
  }

  generalLogger.info('Anonymized benchmark contribution submitted', {
    businessType: businessTypeId,
    hasOwnerProfileFields: ownerProfileFields !== null,
  })
}

// Exported for unit tests.
export const __testing__ = { extractOwnerProfileFields }
