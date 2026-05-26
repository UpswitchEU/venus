import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { StartupBenchmarkRow } from '@/lib/benchmarks/useStartupBenchmark'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import { useStudioIssues } from './useStudioIssues'

/** Avoids `benchmark_offline` info noise — not the subject of these tests. */
const mockAthenaBenchmark: StartupBenchmarkRow = {
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

function seedMinimalStableStudio() {
  useStartupValuationStore.getState().reset()
  useManualFormStore.getState().updateFormData({ company_name: 'Acme BV' })
  const st = useStartupValuationStore.getState()
  st.setField('investment_amount_sought', 1_000_000)
  st.setField('stage', 'pre_seed')
  st.setField('sector', 'consumer')
  st.setMaturity('sound_idea', 'basic')
}

describe('useStudioIssues', () => {
  beforeEach(() => {
    useStartupValuationStore.getState().reset()
    useManualFormStore.getState().resetForm()
  })

  it('warns when priced-round new-investor slice is very high vs typical 10–15%', () => {
    seedMinimalStableStudio()
    useStartupValuationStore.getState().setCapField('pre_money_target', 1_700_000)

    const { result } = renderHook(() => useStudioIssues(mockAthenaBenchmark))
    expect(result.current.warnings.some((w) => w.id === 'high_priced_round_slice')).toBe(true)
  })

  it('does not flag high slice when SAFE notes exist (ownership TBD until conversion)', () => {
    seedMinimalStableStudio()
    useStartupValuationStore.getState().setCapField('pre_money_target', 1_700_000)
    useStartupValuationStore.getState().addSafeNote()

    const { result } = renderHook(() => useStudioIssues(mockAthenaBenchmark))
    expect(result.current.warnings.some((w) => w.id === 'high_priced_round_slice')).toBe(false)
  })

  it('recurring-sector traction warning uses human sector labels, not enum slugs', () => {
    useStartupValuationStore.getState().reset()
    useManualFormStore.getState().updateFormData({ company_name: 'Acme BV' })
    const st = useStartupValuationStore.getState()
    st.setField('stage', 'pre_seed')
    st.setField('sector', 'saas')
    st.setMaturity('sound_idea', 'basic')
    st.setField('investment_amount_sought', 500_000)

    const { result } = renderHook(() => useStudioIssues(mockAthenaBenchmark))
    const w = result.current.warnings.find((i) => i.id === 'recurring_sector_no_arr')
    expect(w).toBeDefined()
    expect(w?.title.en).toContain('B2B SaaS')
    expect(w?.title.en).not.toMatch(/logged for SAAS\b/i)
    expect(w?.title.nl).toContain('B2B SaaS')
  })

  it('does not warn about missing ARR after the founder explicitly marks pre-revenue', () => {
    useStartupValuationStore.getState().reset()
    useManualFormStore.getState().updateFormData({ company_name: 'Acme BV' })
    const st = useStartupValuationStore.getState()
    st.setField('stage', 'pre_seed')
    st.setField('sector', 'saas')
    st.setMaturity('sound_idea', 'basic')
    st.setField('investment_amount_sought', 500_000)
    st.setField('revenue_status', 'no')

    const { result } = renderHook(() => useStudioIssues(mockAthenaBenchmark))
    expect(result.current.warnings.some((i) => i.id === 'recurring_sector_no_arr')).toBe(false)
  })
})
