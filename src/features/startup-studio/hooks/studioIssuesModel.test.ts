import { describe, expect, it } from 'vitest'
import type { StartupBenchmarkRow } from '@/lib/benchmarks/useStartupBenchmark'
import { INITIAL_STARTUP_VALUATION_STATE } from '@/store/manual/startupValuationInitialState'
import type { StartupValuationState } from '@/store/manual/useStartupValuationStore'
import { deriveStudioIssuesResult, pickStudioIssues } from './studioIssuesModel'
import type { LiveValuation } from './useLiveValuation'

const athenaBenchmark: StartupBenchmarkRow = {
  region_code: 'BE',
  stage: 'pre_seed',
  sector: 'consumer',
  average_pre_money_eur: 3_000_000,
  berkus_max_per_milestone_eur: 400_000,
  exit_multiple_low: 4,
  exit_multiple_high: 8,
  default_target_roi_x: 10,
  default_dilution_pct: 18,
  default_yoy_growth_factor: 3,
  source: 'athena',
  methodology_version: 'studio-v2',
  published_at: '2026-01-01T00:00:00Z',
}

const offlineBenchmark: StartupBenchmarkRow = {
  ...athenaBenchmark,
  methodology_version: 'studio-v2-offline',
  source: 'athena-offline-cache',
}

function cloneInitialState(): StartupValuationState {
  return {
    ...INITIAL_STARTUP_VALUATION_STATE,
    cap_table: {
      ...INITIAL_STARTUP_VALUATION_STATE.cap_table,
      safe_notes: [...INITIAL_STARTUP_VALUATION_STATE.cap_table.safe_notes],
    },
    evidence_notes: { ...INITIAL_STARTUP_VALUATION_STATE.evidence_notes },
    founder_pedigree: { ...INITIAL_STARTUP_VALUATION_STATE.founder_pedigree },
    maturity: { ...INITIAL_STARTUP_VALUATION_STATE.maturity },
    pedigree_evidence: { ...INITIAL_STARTUP_VALUATION_STATE.pedigree_evidence },
  }
}

function makeStableState(overrides: Partial<StartupValuationState> = {}): StartupValuationState {
  const base = cloneInitialState()
  return {
    ...base,
    investment_amount_sought: 1_000_000,
    sector: 'consumer',
    sound_idea: 40,
    stage: 'pre_seed',
    ...overrides,
    cap_table: {
      ...base.cap_table,
      ...overrides.cap_table,
      safe_notes: overrides.cap_table?.safe_notes ?? base.cap_table.safe_notes,
    },
    evidence_notes: {
      ...base.evidence_notes,
      sound_idea: 'Customer pain is validated with signed pilot conversations.',
      prototype_status: 'Clickable prototype used in founder demos.',
      ...overrides.evidence_notes,
    },
    founder_pedigree: { ...base.founder_pedigree, ...overrides.founder_pedigree },
    maturity: { ...base.maturity, sound_idea: 'basic', ...overrides.maturity },
    pedigree_evidence: { ...base.pedigree_evidence, ...overrides.pedigree_evidence },
  }
}

function makeValuation(overrides: Partial<LiveValuation> = {}): LiveValuation {
  return {
    blended: { low: 2_400_000, mid: 3_000_000, high: 3_600_000 },
    blendedPreLens: { low: 2_400_000, mid: 3_000_000, high: 3_600_000 },
    blendedPrePedigree: { low: 2_400_000, mid: 3_000_000, high: 3_600_000 },
    inceptionLens: 'milestones_driven',
    inceptionLensBandWidenPct: 0,
    inceptionLensMultiplier: 1,
    isEmpty: false,
    pedigreeMultiplier: 1,
    legs: [
      {
        high: 1_380_000,
        key: 'berkus',
        label: 'studio.legs.berkus',
        low: 1_020_000,
        unavailable: false,
        value: 1_200_000,
        weight: 1,
      },
    ],
    ...overrides,
  }
}

describe('studioIssuesModel', () => {
  it('derives grouped result buckets without rendering the hook', () => {
    const result = deriveStudioIssuesResult({
      benchmark: offlineBenchmark,
      companyName: 'Acme BV',
      state: makeStableState(),
      valuation: makeValuation(),
    })

    expect(result.issues.map((issue) => issue.id)).toContain('benchmark_offline')
    expect(result.infos.map((issue) => issue.id)).toContain('benchmark_offline')
    expect(result.blockers).toHaveLength(0)
  })

  it('flags high priced-round slices unless SAFE notes make ownership unresolved', () => {
    const valuation = makeValuation()
    const highSliceState = makeStableState({
      cap_table: { ...cloneInitialState().cap_table, pre_money_target: 1_700_000 },
    })
    const safeState = makeStableState({
      cap_table: {
        ...cloneInitialState().cap_table,
        pre_money_target: 1_700_000,
        safe_notes: [
          {
            amount: 250_000,
            discount_pct: null,
            holder_label: 'Angel',
            id: 'safe-1',
            valuation_cap: null,
          },
        ],
      },
    })

    expect(
      pickStudioIssues(highSliceState, valuation, athenaBenchmark, 'Acme BV').some(
        (issue) => issue.id === 'high_priced_round_slice'
      )
    ).toBe(true)
    expect(
      pickStudioIssues(safeState, valuation, athenaBenchmark, 'Acme BV').some(
        (issue) => issue.id === 'high_priced_round_slice'
      )
    ).toBe(false)
  })

  it('blocks seed-stage reports when only the Berkus leg is firing', () => {
    const issues = pickStudioIssues(
      makeStableState({ stage: 'seed' }),
      makeValuation(),
      athenaBenchmark,
      'Acme BV'
    )

    expect(issues.find((issue) => issue.id === 'thin_blend_for_stage')?.severity).toBe('block')
  })
})
