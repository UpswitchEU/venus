/**
 * Omni-aligned **client preview** helpers for the manual calculator (pure math + formatters).
 *
 * - **Domain math**: `../saas`, `../sde`, and modules in this folder.
 * - **UI**: import `useManualPreviewFormatters` in client sections for consistent € / % formatting (`formatEurCompact` for DCF sensitivity EV cells).
 * - **Audit**: `METHOD_PREVIEW_AUDIT` lists which engine methods have local previews vs server-only calibration.
 *
 * @see README.md in this folder for the module map.
 */

// Re-export domain modules for a single import path
export * from '../saas'
export * from '../sde'
export { resolveBookEquityFromYearRow, type YearRowForBookEquity } from './bookEquityFromYearRow'
export { coalesceFiniteNumber, toFiniteNumber } from './guards'
export {
  createManualCurrencyFormatter,
  createManualMetricFormatter,
  createManualPreviewFormatters,
  formatEurCompactBelgian,
  getBelgianNumberLocale,
  type ManualPreviewFormatters,
} from './manualPreviewFormatters'
export { computeEbitdaMarginPct } from './marketBasicsPreview'
export { METHOD_PREVIEW_AUDIT } from './methodPreviewAudit'
export {
  computeNavBookReferences,
  computeNavPrefill,
  DEAL_BUYER_DISCOUNT_DEFAULT_PCT,
  DEAL_REGISTRATION_DUTY_BE_PCT,
  DEAL_REGISTRATION_DUTY_NL_PCT,
  NAV_EQUIPMENT_DEFAULT_AGE_YEARS,
  NAV_EQUIPMENT_DEFAULT_USEFUL_LIFE_YEARS,
  NAV_TAX_LATENCY_DEFAULT_BE_PCT,
  NAV_TAX_LATENCY_DEFAULT_NL_PCT,
  type NavBookReferenceInputs,
  type NavBookReferenceSnapshot,
  type NavPrefillField,
  type NavPrefillInputs,
  type NavPrefillProvenance,
  type NavPrefillProvenanceMap,
  type NavPrefillProvenanceSource,
  type NavPrefillSnapshot,
  resolveCountryRegistrationDutyPct,
  resolveCountryTaxLatencyPct,
} from './navPrefill'
export {
  computeGrossPositiveAdjustments,
  computeNavAdjustmentsSum,
  computeTaxLatencyDeduction,
  countFilledNavFields,
  countFilledNavProgressFields,
  hasAnyNavAdjustment,
  NAV_DEFAULT_TAX_LATENCY_PCT,
  NAV_PROGRESS_TOTAL_FIELDS,
  NAV_SECTOR_DEFAULTS,
  NAV_TOTAL_FIELDS,
  type NavDeductionInputs,
  type NavProgressInputs,
  type NavScheduleInputs,
  resolveNavSectorKey,
} from './navSchedulePreview'
export { ownershipMultiplierFromSharesForSale } from './ownershipMultiplier'
export { type BelgianLocaleTag, PREVIEW_DECIMALS } from './previewConstants'
export {
  type RevenueQualityBadgeVariant,
  resolveRevenueQualityBadgeVariant,
} from './revenueQualityBadge'
export {
  computeRevenueQualityPreview,
  getRecurringRevenueBadge,
  getTopClientBadge,
  type RecurringBadge,
  type RevenueQualityPreviewInputs,
  type RevenueQualityPreviewMetrics,
  type TopClientBadge,
} from './revenueQualityPreview'
export type { MethodPreviewAuditEntry, MethodPreviewAuditRegistry } from './types'
export { useManualPreviewFormatters } from './useManualPreviewFormatters'
