import { PREFILL_SOURCE_ACCOUNTING_INTEGRATION, type PrefillSource } from '../lib/bootstrap/types'

/**
 * Whether ManualInputPanel should show the "Connect & pull" / accounting import strip.
 *
 * Contract with Titan (`buildPrefill` in bootstrap.service.ts):
 * {@link PREFILL_SOURCE_ACCOUNTING_INTEGRATION} is pushed to prefill `sources` when the linked
 * `accountant_customers` row has `financial_data` and/or `financial_data_sources`.
 *
 * `hasImportQuality` covers in-session imports (spotlight) so the summary/refresh
 * path still works when prefill sources are not the single source of truth.
 */
export function shouldPreferIntegrationEntry(
  hasImportQuality: boolean,
  prefillSources: readonly PrefillSource[] | null | undefined
): boolean {
  if (hasImportQuality) return true
  const sources = prefillSources ?? []
  return sources.includes(PREFILL_SOURCE_ACCOUNTING_INTEGRATION)
}
