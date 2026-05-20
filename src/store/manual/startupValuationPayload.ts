import { normalizePreMoneyTarget } from '@/features/startup-studio/utils/resolveHeadlinePreMoney'
import { pedigreeEvidenceForPayload, type StartupValuationState } from './startupValuationDomain'

function omitEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [key, value] of Object.entries(obj) as [keyof T, T[keyof T]][]) {
    if (value !== null && value !== undefined && value !== '') {
      out[key] = value
    }
  }
  return out
}

export function buildStartupValuationPayload(
  state: StartupValuationState
): Record<string, unknown> {
  const capTable = omitEmpty({
    pre_money_target: normalizePreMoneyTarget(state.cap_table.pre_money_target),
    option_pool_pct: state.cap_table.option_pool_pct,
    last_round_amount: state.cap_table.last_round_amount,
    last_round_post_money: state.cap_table.last_round_post_money,
    last_round_date: state.cap_table.last_round_date,
  })
  const safeNotes = state.cap_table.safe_notes
    .filter((note) => typeof note.amount === 'number' && note.amount > 0)
    .map((note) =>
      omitEmpty({
        amount: note.amount,
        valuation_cap: note.valuation_cap,
        discount_pct: note.discount_pct,
        holder_label: note.holder_label,
      })
    )

  const hasEvidence = Object.values(state.evidence_notes).some((value) => value.trim().length > 0)
  const studioMetadata: Record<string, unknown> = {}
  if (state.description.trim()) studioMetadata.description = state.description.trim()
  if (hasEvidence) {
    studioMetadata.evidence_notes = Object.fromEntries(
      Object.entries(state.evidence_notes).filter(([, value]) => value.trim().length > 0)
    )
  }

  return {
    stage: state.stage,
    country_code: state.country_code || 'BE',
    sector: state.sector,
    sound_idea: state.sound_idea,
    prototype_status: state.prototype_status,
    management_strength: state.management_strength,
    strategic_relationships: state.strategic_relationships,
    product_rollout: state.product_rollout,
    opportunity_size: state.opportunity_size,
    competitive_environment: state.competitive_environment,
    sales_marketing_channels: state.sales_marketing_channels,
    need_for_additional_funding: state.need_for_additional_funding,
    other_factors: state.other_factors,
    ...omitEmpty({
      mrr: state.mrr,
      // ARR auto-derive: the ValuationIQ SaaS-Forward leg gates on
      // inputs.arr > 0. If the founder provides MRR only, send ARR = MRR * 12
      // so the API receives the same revenue signal the wizard preview showed.
      arr:
        state.arr != null
          ? state.arr
          : typeof state.mrr === 'number' && state.mrr > 0
            ? state.mrr * 12
            : null,
      mrr_growth_rate_pct: state.mrr_growth_rate_pct,
      monthly_churn_pct: state.monthly_churn_pct,
      cac: state.cac,
      ltv: state.ltv,
      burn_rate_monthly: state.burn_rate_monthly,
      runway_months: state.runway_months,
      team_size: state.team_size,
      active_users: state.active_users,
      year5_revenue_projection: state.year5_revenue_projection,
      exit_revenue_multiple: state.exit_revenue_multiple,
      exit_revenue_multiple_rationale: state.exit_revenue_multiple_rationale,
      target_roi_x: state.target_roi_x,
      dilution_assumption_pct: state.dilution_assumption_pct,
      investment_amount_sought: state.investment_amount_sought,
    }),
    cap_table: { ...capTable, safe_notes: safeNotes },
    ...(state.inception_lens && state.inception_lens !== 'milestones_driven'
      ? { inception_lens: state.inception_lens }
      : {}),
    ...(Object.values(state.founder_pedigree).some(Boolean)
      ? {
          founder_pedigree: {
            ...state.founder_pedigree,
            pedigree_evidence: pedigreeEvidenceForPayload(state.pedigree_evidence),
          },
        }
      : {}),
    ...(Object.keys(studioMetadata).length > 0 ? { studio_v2: studioMetadata } : {}),
  }
}
