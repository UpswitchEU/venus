import { PREFILL_SOURCE_ACCOUNTING_INTEGRATION } from '@/lib/bootstrap/types'

/**
 * Whether Venus should emphasize integration/import accounting UI for this bootstrap.
 *
 * Mirrors Titan `bootstrap.service` intent: `{@link PrefillSource} === accounting_integration`
 * when the dossier carries Hermes/integration-backed financials. Also true when import-quality
 * data is already hydrated (Hermes summaries in the normalization store).
 *
 * Do **not** key this on `isAccountantFlow` or client display name alone — manual-only dossiers
 * would incorrectly see tenant-integration copy (see Venus integration audit plan §A).
 */
export function shouldPreferIntegrationEntry(
  hasImportQuality: boolean,
  prefillSources?: readonly string[] | null
): boolean {
  if (hasImportQuality) return true
  const src = Array.isArray(prefillSources) ? prefillSources : []
  return src.some(
    (tag) => String(tag).trim() === PREFILL_SOURCE_ACCOUNTING_INTEGRATION
  )
}
