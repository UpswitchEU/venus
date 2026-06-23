import type {
  LiquidationAssetClassCode,
  LiquidationEssentialFieldKey,
  LiquidationLiabilityBucketCode,
  LiquidationNumericFieldKey,
} from './liquidationInputConfig'
import {
  LIQUIDATION_ASSET_CLASS_CODES,
  LIQUIDATION_ESSENTIAL_FIELDS,
  LIQUIDATION_LIABILITY_BUCKET_CODES,
} from './liquidationInputConfig'

export type LiquidationPrefillPatch = {
  field: LiquidationNumericFieldKey
  value: number
}

type LiquidationPrefillFlags = Partial<Record<LiquidationEssentialFieldKey, boolean>>

export function countPositiveLiquidationValues<T extends string>(
  values: Partial<Record<T, number | undefined>> | undefined,
  keys: ReadonlyArray<T>
): number {
  return keys.filter((key) => {
    const value = values?.[key]
    return typeof value === 'number' && Number.isFinite(value) && value > 0
  }).length
}

export function buildLiquidationSectionStatus({
  currentValues,
  liqAssetOverrides,
  liqLiabilityBuckets,
}: {
  currentValues: {
    liqHeadcount?: number
    liqMonthlyRent?: number
    liqPaidUpCapital?: number
    liqDeferredTax?: number
  }
  liqLiabilityBuckets?: Partial<Record<LiquidationLiabilityBucketCode, number>>
  liqAssetOverrides?: Partial<Record<LiquidationAssetClassCode, number>>
}) {
  const essentialsFilled = [
    currentValues.liqHeadcount,
    currentValues.liqMonthlyRent,
    currentValues.liqPaidUpCapital,
    currentValues.liqDeferredTax,
  ].filter((value) => value !== undefined).length

  return {
    essentialsFilled,
    essentialsTotal: LIQUIDATION_ESSENTIAL_FIELDS.length,
    sectionComplete: essentialsFilled === LIQUIDATION_ESSENTIAL_FIELDS.length,
    liabilityBucketsFilled: countPositiveLiquidationValues(
      liqLiabilityBuckets,
      LIQUIDATION_LIABILITY_BUCKET_CODES
    ),
    liabilityBucketsTotal: LIQUIDATION_LIABILITY_BUCKET_CODES.length,
    assetOverridesFilled: countPositiveLiquidationValues(
      liqAssetOverrides,
      LIQUIDATION_ASSET_CLASS_CODES
    ),
    assetOverridesTotal: LIQUIDATION_ASSET_CLASS_CODES.length,
  }
}

export function resolveLiquidationPositivePrefill({
  field,
  currentValue,
  sourceValue,
  transform = (value) => value,
}: {
  field: LiquidationNumericFieldKey
  currentValue: number | undefined
  sourceValue: number | undefined
  transform?: (value: number) => number
}): LiquidationPrefillPatch | null {
  if (currentValue !== undefined || sourceValue === undefined || sourceValue <= 0) {
    return null
  }

  const value = transform(sourceValue)
  return Number.isFinite(value) ? { field, value } : null
}

export function monthlyRentFromAnnualRent(annualRent: number): number {
  return Math.round((annualRent / 12) * 100) / 100
}

export function buildLiquidationPrefillPatches({
  currentValues,
  sourceValues,
  appliedFields = {},
}: {
  currentValues: {
    liqHeadcount?: number
    liqMonthlyRent?: number
    liqPaidUpCapital?: number
    liqDeferredTax?: number
  }
  sourceValues: {
    prefillSourceHeadcount?: number
    prefillSourceAnnualRent?: number
    prefillSourcePaidUpCapital?: number
    prefillSourceDeferredTax?: number
  }
  appliedFields?: LiquidationPrefillFlags
}): LiquidationPrefillPatch[] {
  return [
    resolveLiquidationPositivePrefill({
      field: 'liq_headcount',
      currentValue: currentValues.liqHeadcount,
      sourceValue: sourceValues.prefillSourceHeadcount,
      transform: Math.floor,
    }),
    resolveLiquidationPositivePrefill({
      field: 'liq_monthly_rent',
      currentValue: currentValues.liqMonthlyRent,
      sourceValue: sourceValues.prefillSourceAnnualRent,
      transform: monthlyRentFromAnnualRent,
    }),
    resolveLiquidationPositivePrefill({
      field: 'liq_paid_up_capital',
      currentValue: currentValues.liqPaidUpCapital,
      sourceValue: sourceValues.prefillSourcePaidUpCapital,
    }),
    resolveLiquidationPositivePrefill({
      field: 'liq_deferred_tax',
      currentValue: currentValues.liqDeferredTax,
      sourceValue: sourceValues.prefillSourceDeferredTax,
    }),
  ].filter((patch): patch is LiquidationPrefillPatch => {
    return patch !== null && !appliedFields[patch.field as LiquidationEssentialFieldKey]
  })
}

export function formatLiquidationPercentDisplay(value: number | undefined | null): string {
  if (value === undefined || value === null) return ''
  return String(Math.round(Number(value) * 1000) / 10)
}

export function parseLiquidationPercentInput(raw: string): number | undefined {
  if (raw === '') return undefined
  const numeric = Number(raw)
  if (!Number.isFinite(numeric)) return undefined
  return Math.max(0, Math.round(numeric * 10) / 1000)
}

export function buildLiquidationLiabilityBuckets(
  formData: Record<string, unknown>,
  keys: ReadonlyArray<LiquidationLiabilityBucketCode>
): Record<string, number> {
  const buckets: Record<string, number> = {}
  for (const key of keys) {
    const raw = formData[`liq_lb_${key}`]
    const value = Number(raw)
    if (raw != null && Number.isFinite(value) && value > 0) {
      buckets[key] = value
    }
  }
  return buckets
}

export function buildLiquidationAssetOverrides(
  formData: Record<string, unknown>,
  keys: ReadonlyArray<LiquidationAssetClassCode>
): Record<string, { adjusted_value: number }> {
  const overrides: Record<string, { adjusted_value: number }> = {}
  for (const key of keys) {
    const raw = formData[`liq_ao_${key}`]
    const value = Number(raw)
    if (raw != null && Number.isFinite(value) && value > 0) {
      overrides[key] = { adjusted_value: value }
    }
  }
  return overrides
}

function readOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

export function readLiquidationLiabilityBucketFormValues(
  formData: object,
  keys: ReadonlyArray<LiquidationLiabilityBucketCode>
): Partial<Record<LiquidationLiabilityBucketCode, number>> {
  const source = formData as Record<string, unknown>
  const values: Partial<Record<LiquidationLiabilityBucketCode, number>> = {}
  for (const key of keys) {
    const value = readOptionalNumber(source[`liq_lb_${key}`])
    if (value !== undefined) values[key] = value
  }
  return values
}

export function readLiquidationAssetOverrideFormValues(
  formData: object,
  keys: ReadonlyArray<LiquidationAssetClassCode>
): Partial<Record<LiquidationAssetClassCode, number>> {
  const source = formData as Record<string, unknown>
  const values: Partial<Record<LiquidationAssetClassCode, number>> = {}
  for (const key of keys) {
    const value = readOptionalNumber(source[`liq_ao_${key}`])
    if (value !== undefined) values[key] = value
  }
  return values
}
