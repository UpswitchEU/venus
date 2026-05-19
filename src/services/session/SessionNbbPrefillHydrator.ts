import type { OfficialFinancialsYear } from '../../lib/bootstrap/types'
import { useNbbPrefillStore } from '../../store/useNbbPrefillStore'
import { generalLogger } from '../../utils/logger'

type NbbSource = 'restore' | 'package'

export function seedNbbPrefillFromFormData(
  formData: Record<string, unknown> | null | undefined,
  reportId: string,
  source: NbbSource
): void {
  if (!formData) return
  const official = formData.official_financials
  if (!official || typeof official !== 'object' || Array.isArray(official)) return

  const years =
    ((official as { historicalYears?: unknown }).historicalYears as
      | OfficialFinancialsYear[]
      | undefined) ??
    ((official as { historical_years?: unknown }).historical_years as
      | OfficialFinancialsYear[]
      | undefined)
  if (!Array.isArray(years) || years.length === 0) return

  useNbbPrefillStore.getState().setFromHistoricalYears(years)
  generalLogger.info('[SessionRestoration] NBB prefill snapshots hydrated', {
    reportId: reportId.substring(0, 30),
    source,
    yearsCount: years.length,
  })
}
