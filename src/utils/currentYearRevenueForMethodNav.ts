/**
 * Current-year turnover for upfront valuation method eligibility (omzet / EV–Revenue path).
 * Pure helper — safe for SSR and tests; no browser APIs.
 */
export type FormSnapshotForRevenueNav = {
  current_year_data?: { revenue?: number | string | null } | null
  revenue?: number | string | null
}

export function parseCurrentYearRevenueForMethodNav(formData: FormSnapshotForRevenueNav): number | undefined {
  const cyd = formData?.current_year_data
  const raw = cyd?.revenue ?? formData?.revenue
  if (raw === '' || raw == null) return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}
