/**
 * Locale Routes Loading State
 *
 * Uses the same CalculatorShellSkeleton that Mercury shows during the
 * cross-app redirect. This eliminates the visual "glitch" where users
 * would see a mismatched simple skeleton before the full calculator
 * skeleton appeared.
 */
import { CalculatorShellSkeleton } from '../../src/components/calculator'

export default function Loading() {
  return <CalculatorShellSkeleton />
}
