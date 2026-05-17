export { AdaptivePercentInput } from './AdaptivePercentInput'
export { AdvancedAdvisorControlsSection } from './AdvancedAdvisorControlsSection'
// Round-6 audit: `BelgianSmeAuditPanel` no longer exported from the
// sections barrel. It renders advisory output (SDE bridge, NAV
// revaluation log, deal-structure comparison) — that lives in the
// ValuationIQ report (`_nav_audit_trail.html` + `_nav_deal_structure.html`).
// The component file stays in the tree for any future advisor-mode
// preview that legitimately needs an inline audit, but it must be
// imported with the explicit deep path so the import flag-reviews it.
export { CapitalHistorySection } from './CapitalHistorySection'
export { DcfForecastWorkspace } from './DcfForecastWorkspace'
export {
  DcfGlobalAssumptions,
  type DcfGlobalAssumptionsVariant,
} from './DcfGlobalAssumptions'
export { DcfProjectionTable } from './DcfProjectionTable'
export { DcfSensitivityMatrix } from './DcfSensitivityMatrix'
export {
  type DealScenario,
  DealStructureCompareSection,
  type DealStructureComparison,
  type DealStructureInputs,
} from './DealStructureCompareSection'
export {
  DCF_DEFAULT_CAPEX_PCT,
  DCF_DEFAULT_DA_PCT,
  DCF_DEFAULT_EBITDA_MARGIN_FALLBACK_PCT,
  DCF_DEFAULT_NWC_PCT,
  DCF_DEFAULT_REVENUE_GROWTH_PCT,
  DCF_DEFAULT_TAX_RATE_PCT,
  DCF_DEFAULT_TERMINAL_GROWTH_PCT,
  DCF_DEFAULT_WACC_PCT,
} from './dcfEngineDefaults'
export { FiscalInputsSection } from './FiscalInputsSection'
export { FiscalReferencePreviewCard } from './FiscalReferencePreviewCard'
export { LiquidationInputsSection } from './LiquidationInputsSection'
export { MethodPreviewAuditDevPanel } from './MethodPreviewAuditDevPanel'
export { NavAssetScheduleSection } from './NavAssetScheduleSection'
export {
  computeEquipmentMeerwaarde,
  NavEquipmentLifespanSection,
} from './NavEquipmentLifespanSection'
export { NavRealEstateAppraisalSection } from './NavRealEstateAppraisalSection'
// Round-6 audit: `NavRevaluationAuditLog` no longer exported from the
// sections barrel either — it's the per-asset deferred-tax/SME-rate
// table that BelgianSmeAuditPanel composes for advisory output. The
// data shapes (`DeferredTaxBreakdownRow`, `RealEstateRevaluation`,
// `SmeEligibilityPayload`) stay exported because Venus consumes them
// in tests and helpers, but the rendering component is gated behind
// the deep import.
export {
  type DeferredTaxBreakdownRow,
  type RealEstateRevaluation,
  type SmeEligibilityPayload,
} from './NavRevaluationAuditLog'
export {
  formatPreviewMetricValue,
  PreviewMetricCard,
  roundPreviewMetric,
} from './previewMetricCards'
export { RealEstateCarveOutSection } from './RealEstateCarveOutSection'
export { RevenueQualitySection } from './RevenueQualitySection'
export { SaasMetricsSection } from './SaasMetricsSection'
export { SdeBridgeLadder, type SdeBridgeRow } from './SdeBridgeLadder'
export { SdeOwnerCompensationSection } from './SdeOwnerCompensationSection'
export { SynthesisWeightingSection } from './SynthesisWeightingSection'

export {
  SECTION_HEADER_ROW_CLASS,
  SectionStatusCircle,
  ValuationSectionHeader,
} from './ValuationSectionHeader'
