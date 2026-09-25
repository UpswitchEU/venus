'use client'

/**
 * useStudioIssues
 * ----------------
 *
 * React wiring for the Startup Studio issue engine. The issue rules and
 * multilingual copy live in studioIssuesModel so they can be tested without
 * rendering this hook or touching Zustand.
 */

import type { StartupBenchmarkRow } from '@/lib/benchmarks/useStartupBenchmark'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import { deriveStudioIssuesResult } from './studioIssuesModel'
import { useLiveValuation } from './useLiveValuation'

export type {
  StudioIssue,
  StudioIssueCopy,
  StudioIssueSeverity,
  StudioIssuesResult,
  StudioStepId,
} from './studioIssuesModel'

/**
 * Top-level hook. Re-runs whenever the persisted Studio state, live
 * valuation, or active benchmark row changes.
 *
 * `enabled: false` keeps the live startup preview from calling the engine: the
 * advisor workspace mounts this hook on every valuation, startup or not.
 */
export function useStudioIssues(
  benchmark: StartupBenchmarkRow,
  options: { enabled?: boolean } = {}
) {
  const valuation = useLiveValuation(benchmark, options)
  const state = useStartupValuationStore()
  // Company name lives on the manual form store (shared with SME flows);
  // we read it via the same selector StudioShell uses.
  const companyName = useManualFormStore((s) => s.formData.company_name ?? '')

  return deriveStudioIssuesResult({ state, valuation, benchmark, companyName })
}
