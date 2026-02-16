/**
 * Report Route Loading State
 *
 * Uses the same CalculatorShellSkeleton that Mercury shows during the
 * cross-app redirect. This ensures a seamless visual transition when
 * navigating from Mercury to Venus via the accountant valuation flow.
 */
import { CalculatorShellSkeleton } from '../../../../src/components/calculator'

export default function Loading() {
  return <CalculatorShellSkeleton />
}
