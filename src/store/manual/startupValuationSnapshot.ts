import { normalizePreMoneyTarget } from '@/features/startup-studio/utils/resolveHeadlinePreMoney'
import {
  type FounderPedigreeEvidence,
  type MaturityLevel,
  type StartupSector,
  type StartupStage,
  type StartupValuationState,
  sanitizePedigreeEvidenceMap,
} from './startupValuationDomain'

const VALID_STAGES: readonly StartupStage[] = ['pre_seed', 'seed', 'series_a']
const VALID_SECTORS: readonly StartupSector[] = [
  'saas',
  'marketplace',
  'fintech',
  'biotech_healthtech',
  'deeptech_ai',
  'vertical_ai',
  'consumer',
  'hardware',
  'other',
]
const VALID_MATURITY_LEVELS: readonly MaturityLevel[] = ['none', 'basic', 'strong', 'exceptional']
const SCORE_KEYS = [
  'sound_idea',
  'prototype_status',
  'management_strength',
  'strategic_relationships',
  'product_rollout',
  'opportunity_size',
  'competitive_environment',
  'sales_marketing_channels',
  'need_for_additional_funding',
  'other_factors',
] as const
const OPTIONAL_NUMERIC_KEYS = [
  'mrr',
  'arr',
  'mrr_growth_rate_pct',
  'monthly_churn_pct',
  'cac',
  'ltv',
  'burn_rate_monthly',
  'runway_months',
  'team_size',
  'active_users',
  'year5_revenue_projection',
  'exit_revenue_multiple',
  'target_roi_x',
  'dilution_assumption_pct',
  'investment_amount_sought',
] as const

function pickEvidence(raw: unknown): FounderPedigreeEvidence {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return sanitizePedigreeEvidenceMap(raw as Record<string, unknown>)
}

export function applyStartupValuationSnapshot(
  state: StartupValuationState,
  snapshot: Record<string, unknown>
): StartupValuationState {
  const next = { ...state }

  if (typeof snapshot.stage === 'string' && VALID_STAGES.includes(snapshot.stage as StartupStage)) {
    next.stage = snapshot.stage as StartupStage
  }
  if (typeof snapshot.country_code === 'string' && snapshot.country_code.trim()) {
    next.country_code = snapshot.country_code.trim().toUpperCase()
  }
  if (
    typeof snapshot.sector === 'string' &&
    VALID_SECTORS.includes(snapshot.sector as StartupSector)
  ) {
    next.sector = snapshot.sector as StartupSector
    next._sectorWasUserSet = true
  }

  for (const key of SCORE_KEYS) {
    const value = snapshot[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      next[key] = value
    }
  }
  for (const key of OPTIONAL_NUMERIC_KEYS) {
    const value = snapshot[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      next[key] = value
    } else if (value === null) {
      next[key] = null
    }
  }

  if (snapshot.cap_table && typeof snapshot.cap_table === 'object') {
    const capTable = snapshot.cap_table as Record<string, unknown>
    next.cap_table = {
      ...next.cap_table,
      ...(typeof capTable.pre_money_target === 'number' || capTable.pre_money_target === null
        ? { pre_money_target: normalizePreMoneyTarget(capTable.pre_money_target as number | null) }
        : {}),
      ...(typeof capTable.option_pool_pct === 'number'
        ? { option_pool_pct: capTable.option_pool_pct }
        : {}),
      ...(typeof capTable.last_round_amount === 'number' || capTable.last_round_amount === null
        ? { last_round_amount: capTable.last_round_amount as number | null }
        : {}),
      ...(typeof capTable.last_round_post_money === 'number' ||
      capTable.last_round_post_money === null
        ? { last_round_post_money: capTable.last_round_post_money as number | null }
        : {}),
      ...(typeof capTable.last_round_date === 'string'
        ? { last_round_date: capTable.last_round_date }
        : {}),
      ...(Array.isArray(capTable.safe_notes)
        ? {
            safe_notes: (capTable.safe_notes as Array<Record<string, unknown>>).map(
              (note, index) => ({
                id:
                  typeof note.id === 'string' && note.id ? note.id : `safe-${Date.now()}-${index}`,
                amount:
                  typeof note.amount === 'number' && Number.isFinite(note.amount)
                    ? note.amount
                    : null,
                valuation_cap:
                  typeof note.valuation_cap === 'number' && Number.isFinite(note.valuation_cap)
                    ? note.valuation_cap
                    : null,
                discount_pct:
                  typeof note.discount_pct === 'number' && Number.isFinite(note.discount_pct)
                    ? note.discount_pct
                    : null,
                holder_label: typeof note.holder_label === 'string' ? note.holder_label : '',
              })
            ),
          }
        : {}),
    }
  }

  if (snapshot.founder_pedigree && typeof snapshot.founder_pedigree === 'object') {
    const founderPedigree = snapshot.founder_pedigree as Record<string, unknown>
    const merged: Record<string, boolean> = { ...next.founder_pedigree }
    for (const key of Object.keys(merged)) {
      if (typeof founderPedigree[key] === 'boolean') merged[key] = founderPedigree[key] as boolean
    }
    next.founder_pedigree = merged as typeof next.founder_pedigree

    const fromTop = pickEvidence(snapshot.pedigree_evidence)
    const fromNested = pickEvidence(founderPedigree.pedigree_evidence)
    const restored = { ...fromNested, ...fromTop }
    if (Object.keys(restored).length > 0) {
      next.pedigree_evidence = restored
    }
  }

  if (snapshot.maturity && typeof snapshot.maturity === 'object') {
    const maturity = snapshot.maturity as Record<string, unknown>
    const merged: Record<string, MaturityLevel> = { ...next.maturity }
    for (const key of Object.keys(merged)) {
      const value = maturity[key]
      if (typeof value === 'string' && VALID_MATURITY_LEVELS.includes(value as MaturityLevel)) {
        merged[key] = value as MaturityLevel
      }
    }
    next.maturity = merged as typeof next.maturity
  }

  const studioV2 =
    snapshot.studio_v2 && typeof snapshot.studio_v2 === 'object'
      ? (snapshot.studio_v2 as Record<string, unknown>)
      : ({} as Record<string, unknown>)
  const description = snapshot.description ?? studioV2.description
  if (typeof description === 'string') next.description = description
  const evidenceNotes = snapshot.evidence_notes ?? studioV2.evidence_notes
  if (evidenceNotes && typeof evidenceNotes === 'object') {
    const merged: Record<string, string> = { ...next.evidence_notes }
    for (const [key, value] of Object.entries(evidenceNotes as Record<string, unknown>)) {
      if (key in merged && typeof value === 'string') merged[key] = value
    }
    next.evidence_notes = merged as typeof next.evidence_notes
  }

  if (typeof snapshot.inception_lens === 'string') {
    next.inception_lens = snapshot.inception_lens as typeof next.inception_lens
  }

  return next
}
