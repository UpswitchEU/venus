import { buildManualRestoredFinancialSnapshot } from './manualRestoredFinancialSnapshot'

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Compare explicit calculation inputs, never rendered HTML or generated forecasts.
 *
 * Only the years the saved result recorded are compared. The engine echoes the
 * current year in `details.current_year_data` and carries no history, so a fresh
 * result cannot prove that the form's earlier years changed: comparing them made
 * every multi-year valuation look out of date the moment it was calculated.
 */
export function persistedFinancialInputsDiffer(form: unknown, result: unknown): boolean {
  const saved = record(result)
  if (!saved) return false
  const details = record(saved.details)
  const savedInput = saved.current_year_data ? saved : details
  if (!savedInput?.current_year_data) return false
  const currentForm = record(form)
  if (!currentForm?.current_year_data) return false
  const savedRecordsHistory = Array.isArray(savedInput.historical_years_data)
  const snapshot = (value: Record<string, unknown>) =>
    buildManualRestoredFinancialSnapshot({
      current_year_data: value.current_year_data,
      historical_years_data: savedRecordsHistory ? value.historical_years_data : undefined,
    })
  const current = snapshot(currentForm)
  const previous = snapshot(savedInput)
  // Sparse legacy results cannot prove equivalence or a change. Do not invent
  // input years from the current calendar or from report publication dates.
  if (!current || !previous) return false
  return JSON.stringify(current.yearlyFinancials) !== JSON.stringify(previous.yearlyFinancials)
}
