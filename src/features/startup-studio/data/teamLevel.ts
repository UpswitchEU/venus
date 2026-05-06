/**
 * Team-strength picker — collapses the 6 explicit founder-pedigree flags
 * into a single 4-bucket plain-language question.
 *
 * Why this exists:
 *   The Express valuation flow targets owners, not VCs.  Six checkboxes
 *   like "Top-tier scaleup alumnus (≥2 years, IC4+)" or "10+ years industry
 *   experience" make a non-finance founder reach for Claude — too dense,
 *   too much VC vocabulary, too many marginal cases.  This module presents
 *   ONE picker ("How experienced is your team?") with four cards every
 *   founder can answer in 5 seconds, and translates the pick into the
 *   same flag-set the engine consumes.
 *
 *   The advanced disclosure still exposes the 6 explicit flags for
 *   advisors / auditors who want defensible per-claim provenance.
 *
 * Calibration: the bucket → flag-set mapping below produces multipliers
 * that span the engine's [0.70×, 1.80×] envelope:
 *
 *   first_time:    {} → 1.00×
 *   experienced:   {has_technical_cofounder, domain_expert_10y} → 1.25×
 *   veteran:       {has_technical_cofounder, domain_expert_10y, second_time_founder} → 1.35×
 *   dream_team:    {prior_exit, top_unicorn_alumnus, has_technical_cofounder} → 1.60×
 *
 * The four buckets are intentionally NOT a strict superset chain —
 * "veteran" and "dream_team" represent different paths (operating
 * experience vs. exit / mafia track record), so a founder picks whichever
 * narrative matches better and the engine produces a defensible number
 * either way.
 */

import type {
  FounderPedigreeFlags,
  FounderPedigreeKey,
} from '@/store/manual/useStartupValuationStore'

export type TeamLevel = 'first_time' | 'experienced' | 'veteran' | 'dream_team'

export const TEAM_LEVEL_ORDER: readonly TeamLevel[] = [
  'first_time',
  'experienced',
  'veteran',
  'dream_team',
] as const

/**
 * Bucket → engine flag-set.  The flags written here exactly match the
 * 6 explicit founder-pedigree booleans the engine already consumes, so
 * picking a TeamLevel is a strict superset of clicking the underlying
 * checkboxes by hand — no special-case engine path required.
 */
const TEAM_LEVEL_FLAGS: Record<TeamLevel, FounderPedigreeFlags> = {
  first_time: {
    prior_exit: false,
    top_unicorn_alumnus: false,
    domain_expert_10y: false,
    second_time_founder: false,
    has_technical_cofounder: false,
    solo_founder: false,
  },
  experienced: {
    prior_exit: false,
    top_unicorn_alumnus: false,
    domain_expert_10y: true,
    second_time_founder: false,
    has_technical_cofounder: true,
    solo_founder: false,
  },
  veteran: {
    prior_exit: false,
    top_unicorn_alumnus: false,
    domain_expert_10y: true,
    second_time_founder: true,
    has_technical_cofounder: true,
    solo_founder: false,
  },
  dream_team: {
    prior_exit: true,
    top_unicorn_alumnus: true,
    domain_expert_10y: false,
    second_time_founder: false,
    has_technical_cofounder: true,
    solo_founder: false,
  },
}

export function getTeamLevelFlags(level: TeamLevel): FounderPedigreeFlags {
  return { ...TEAM_LEVEL_FLAGS[level] }
}

/**
 * Reverse-lookup: given a current pedigree-flags state, infer which
 * TeamLevel bucket the founder is currently sitting in.
 *
 * Used so a founder coming back from the Demo preset (which sets explicit
 * flags) sees the matching TeamLevel card highlighted automatically.
 *
 * Returns null when the flag-set doesn't match any bucket — the picker
 * UI then shows all four cards inactive (signals "you're in custom
 * territory, pick a card to overwrite with a clean baseline" or expand
 * the Advanced section to see your raw flags).
 */
export function inferTeamLevel(flags: FounderPedigreeFlags): TeamLevel | null {
  const flagKeys: FounderPedigreeKey[] = [
    'prior_exit',
    'top_unicorn_alumnus',
    'domain_expert_10y',
    'second_time_founder',
    'has_technical_cofounder',
    'solo_founder',
  ]
  for (const level of TEAM_LEVEL_ORDER) {
    const target = TEAM_LEVEL_FLAGS[level]
    const matches = flagKeys.every((k) => flags[k] === target[k])
    if (matches) return level
  }
  return null
}
