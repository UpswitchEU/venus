/**
 * Omni-aligned **client preview** helpers for the manual calculator (pure math + formatters).
 *
 * - **Domain math**: `../saas`, `../sde`, and modules in this folder.
 * - **UI**: import `useManualPreviewFormatters` in client sections for consistent € / % formatting (`formatEurCompact` for DCF sensitivity EV cells).
 * - **Audit**: `METHOD_PREVIEW_AUDIT` lists which engine methods have local previews vs server-only calibration.
 *
 * @see README.md in this folder for the module map.
 */
export { resolveBookEquityFromYearRow, type YearRowForBookEquity } from './bookEquityFromYearRow'
export { toFiniteNumber } from './guards'
export {
  createManualCurrencyFormatter,
  createManualMetricFormatter,
  createManualPreviewFormatters,
  formatEurCompactBelgian,
  getBelgianNumberLocale,
  type ManualPreviewFormatters,
} from './manualPreviewFormatters'
export { PREVIEW_DECIMALS, type BelgianLocaleTag } from './previewConstants'
export {
  computeFiscal4xPreview,
  FISCAL_EBITDA_MULTIPLIER,
  type Fiscal4xPreviewInputs,
  type Fiscal4xPreviewMetrics,
  type Fiscal4xUnavailableReason,
} from './fiscalPreviewMetrics'
export { computeEbitdaMarginPct } from './marketBasicsPreview'
export { METHOD_PREVIEW_AUDIT } from './methodPreviewAudit'
export {
  computeEstimatedNav,
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
  resolveNavSectorKey,
  type NavDeductionInputs,
  type NavProgressInputs,
  type NavScheduleInputs,
} from './navSchedulePreview'
export { ownershipMultiplierFromSharesForSale } from './ownershipMultiplier'
export {
  computeRevenueQualityPreview,
  getRecurringRevenueBadge,
  getTopClientBadge,
  type RecurringBadge,
  type RevenueQualityPreviewInputs,
  type RevenueQualityPreviewMetrics,
  type TopClientBadge,
} from './revenueQualityPreview'
export {
  resolveRevenueQualityBadgeVariant,
  type RevenueQualityBadgeVariant,
} from './revenueQualityBadge'
export type { MethodPreviewAuditEntry, MethodPreviewAuditRegistry } from './types'
export { useManualPreviewFormatters } from './useManualPreviewFormatters'

// Re-export domain modules for a single import path
export * from '../saas'
export * from '../sde'
