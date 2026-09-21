import { buildManualRestoredFinancialSnapshot } from './manualRestoredFinancialSnapshot'

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Compare explicit calculation inputs, never rendered HTML or generated forecasts. */
export function persistedFinancialInputsDiffer(form: unknown, result: unknown): boolean {
  const saved = record(result)
  if (!saved) return false
  const details = record(saved.details)
  const savedInput = saved.current_year_data ? saved : details
  if (!savedInput?.current_year_data) return false
  const currentForm = record(form)
  if (!currentForm?.current_year_data) return false
  const snapshot = (value: Record<string, unknown>) =>
    buildManualRestoredFinancialSnapshot({
      current_year_data: value.current_year_data,
      historical_years_data: value.historical_years_data,
    })
  const current = snapshot(currentForm)
  const previous = snapshot(savedInput)
  // Sparse legacy results cannot prove equivalence or a change. Do not invent
  // input years from the current calendar or from report publication dates.
  if (!current || !previous) return false
  return JSON.stringify(current.yearlyFinancials) !== JSON.stringify(previous.yearlyFinancials)
}
