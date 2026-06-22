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
 */
export function useStudioIssues(benchmark: StartupBenchmarkRow) {
  const valuation = useLiveValuation(benchmark)
  const state = useStartupValuationStore()
  // Company name lives on the manual form store (shared with SME flows);
  // we read it via the same selector StudioShell uses.
  const companyName = useManualFormStore((s) => s.formData.company_name ?? '')

  return deriveStudioIssuesResult({ state, valuation, benchmark, companyName })
}
