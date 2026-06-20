// `going_concern` is intentionally not exposed. Liquidation analysis is a
// standalone premise of value: orderly/forced wind-down, not a going-concern
// method. Advisors who need the going-concern reference should use Adjusted NAV
// or another going-concern lens, which is reconciled against liquidation later.
export const LIQUIDATION_PREMISE_OPTIONS = [
  { value: '', i18nKey: 'auto' },
  { value: 'orderly_liquidation', i18nKey: 'orderlyLiquidation' },
  { value: 'forced_liquidation', i18nKey: 'forcedLiquidation' },
] as const

export const LIQUIDATION_ESSENTIAL_FIELDS = [
  'liq_headcount',
  'liq_monthly_rent',
  'liq_paid_up_capital',
  'liq_deferred_tax',
] as const

export const LIQUIDATION_ADVANCED_FIELDS = [
  'liq_realised_capital_gains',
  'liq_taxable_reserves',
  'liq_runway_months_orderly',
  'liq_runway_months_forced',
  'liq_distress_wacc_orderly',
  'liq_distress_wacc_forced',
  'liq_intangibles_uplift_pct',
  'liq_multiples_value_override',
] as const

/**
 * Per-tier liability bucket order — mirrors
 * `priority_cascade.CascadeTierCode` on the engine side.
 *
 * `shareholders` is intentionally excluded: the cascade computes the
 * residual class instead of accepting it as an advisor input.
 */
export const LIQUIDATION_LIABILITY_BUCKET_TIERS = [
  { code: 'estate_costs', i18nKey: 'estateCosts' },
  { code: 'secured', i18nKey: 'secured' },
  { code: 'super_preferent_employees', i18nKey: 'superPreferentEmployees' },
  { code: 'preferent_tax', i18nKey: 'preferentTax' },
  { code: 'preferent_other', i18nKey: 'preferentOther' },
  { code: 'unsecured', i18nKey: 'unsecured' },
  { code: 'subordinated', i18nKey: 'subordinated' },
] as const

export const LIQUIDATION_ASSET_CLASSES = [
  { code: 'cash', i18nKey: 'cash' },
  { code: 'trade_receivables', i18nKey: 'tradeReceivables' },
  { code: 'other_receivables', i18nKey: 'otherReceivables' },
  { code: 'inventory_finished', i18nKey: 'inventoryFinished' },
  { code: 'inventory_wip', i18nKey: 'inventoryWip' },
  { code: 'inventory_raw', i18nKey: 'inventoryRaw' },
  { code: 'land', i18nKey: 'land' },
  { code: 'buildings', i18nKey: 'buildings' },
  { code: 'machinery_equipment', i18nKey: 'machineryEquipment' },
  { code: 'vehicles', i18nKey: 'vehicles' },
  { code: 'it_equipment', i18nKey: 'itEquipment' },
  { code: 'intangibles', i18nKey: 'intangibles' },
] as const

export type LiquidationPremiseOption = (typeof LIQUIDATION_PREMISE_OPTIONS)[number]
export type LiquidationLiabilityBucketCode =
  (typeof LIQUIDATION_LIABILITY_BUCKET_TIERS)[number]['code']
export type LiquidationAssetClassCode = (typeof LIQUIDATION_ASSET_CLASSES)[number]['code']
export type LiquidationEssentialFieldKey = (typeof LIQUIDATION_ESSENTIAL_FIELDS)[number]
export type LiquidationAdvancedFieldKey = (typeof LIQUIDATION_ADVANCED_FIELDS)[number]
export type LiquidationLiabilityBucketFieldKey = `liq_lb_${LiquidationLiabilityBucketCode}`
export type LiquidationAssetOverrideFieldKey = `liq_ao_${LiquidationAssetClassCode}`
export type LiquidationNumericFieldKey =
  | LiquidationEssentialFieldKey
  | LiquidationAdvancedFieldKey
  | LiquidationLiabilityBucketFieldKey
  | LiquidationAssetOverrideFieldKey

export const LIQUIDATION_LIABILITY_BUCKET_CODES = LIQUIDATION_LIABILITY_BUCKET_TIERS.map(
  (tier) => tier.code
) as ReadonlyArray<LiquidationLiabilityBucketCode>

export const LIQUIDATION_ASSET_CLASS_CODES = LIQUIDATION_ASSET_CLASSES.map(
  (cls) => cls.code
) as ReadonlyArray<LiquidationAssetClassCode>

export const LIQUIDATION_LIABILITY_BUCKET_FORM_KEYS = LIQUIDATION_LIABILITY_BUCKET_TIERS.map(
  (tier) => `liq_lb_${tier.code}` as LiquidationLiabilityBucketFieldKey
)

export const LIQUIDATION_ASSET_OVERRIDE_FORM_KEYS = LIQUIDATION_ASSET_CLASSES.map(
  (cls) => `liq_ao_${cls.code}` as LiquidationAssetOverrideFieldKey
)

export const LIQUIDATION_RESET_NUMERIC_FIELD_KEYS: ReadonlyArray<LiquidationNumericFieldKey> = [
  ...LIQUIDATION_ESSENTIAL_FIELDS,
  ...LIQUIDATION_ADVANCED_FIELDS,
  ...LIQUIDATION_LIABILITY_BUCKET_FORM_KEYS,
  ...LIQUIDATION_ASSET_OVERRIDE_FORM_KEYS,
]
