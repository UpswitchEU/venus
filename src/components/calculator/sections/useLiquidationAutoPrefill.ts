import { useCallback, useEffect, useState } from 'react'
import type {
  LiquidationEssentialFieldKey,
  LiquidationNumericFieldKey,
} from '@/lib/methods/liquidation_analysis/liquidationInputConfig'
import { resolveLiquidationPositivePrefill } from '@/lib/methods/liquidation_analysis/liquidationInputModel'

type PrefillFlags = Record<LiquidationEssentialFieldKey, boolean>

interface UseLiquidationAutoPrefillInput {
  liqHeadcount?: number
  liqMonthlyRent?: number
  liqPaidUpCapital?: number
  liqDeferredTax?: number
  prefillSourceHeadcount?: number
  prefillSourceAnnualRent?: number
  prefillSourcePaidUpCapital?: number
  prefillSourceDeferredTax?: number
  onFieldChange: (field: string, value: number | undefined) => void
}

const EMPTY_PREFILL_FLAGS: PrefillFlags = {
  liq_deferred_tax: false,
  liq_headcount: false,
  liq_monthly_rent: false,
  liq_paid_up_capital: false,
}

function monthlyRentFromAnnualRent(annualRent: number): number {
  return Math.round((annualRent / 12) * 100) / 100
}

export function useLiquidationAutoPrefill({
  liqHeadcount,
  liqMonthlyRent,
  liqPaidUpCapital,
  liqDeferredTax,
  prefillSourceHeadcount,
  prefillSourceAnnualRent,
  prefillSourcePaidUpCapital,
  prefillSourceDeferredTax,
  onFieldChange,
}: UseLiquidationAutoPrefillInput) {
  const [prefilledFields, setPrefilledFields] = useState<PrefillFlags>(EMPTY_PREFILL_FLAGS)

  useEffect(() => {
    const patches = [
      resolveLiquidationPositivePrefill({
        field: 'liq_headcount',
        currentValue: liqHeadcount,
        sourceValue: prefillSourceHeadcount,
        transform: Math.floor,
      }),
      resolveLiquidationPositivePrefill({
        field: 'liq_monthly_rent',
        currentValue: liqMonthlyRent,
        sourceValue: prefillSourceAnnualRent,
        transform: monthlyRentFromAnnualRent,
      }),
      resolveLiquidationPositivePrefill({
        field: 'liq_paid_up_capital',
        currentValue: liqPaidUpCapital,
        sourceValue: prefillSourcePaidUpCapital,
      }),
      resolveLiquidationPositivePrefill({
        field: 'liq_deferred_tax',
        currentValue: liqDeferredTax,
        sourceValue: prefillSourceDeferredTax,
      }),
    ].filter((patch): patch is NonNullable<typeof patch> => {
      return patch !== null && !prefilledFields[patch.field as LiquidationEssentialFieldKey]
    })

    if (patches.length === 0) return

    for (const patch of patches) {
      onFieldChange(patch.field, patch.value)
    }

    setPrefilledFields((current) => {
      let next = current
      for (const patch of patches) {
        const field = patch.field as LiquidationEssentialFieldKey
        if (next[field]) continue
        next = next === current ? { ...current } : next
        next[field] = true
      }
      return next
    })
  }, [
    liqDeferredTax,
    liqHeadcount,
    liqMonthlyRent,
    liqPaidUpCapital,
    onFieldChange,
    prefillSourceAnnualRent,
    prefillSourceDeferredTax,
    prefillSourceHeadcount,
    prefillSourcePaidUpCapital,
    prefilledFields,
  ])

  const markFieldEdited = useCallback((field: LiquidationNumericFieldKey) => {
    if (!(field in EMPTY_PREFILL_FLAGS)) return
    const essentialField = field as LiquidationEssentialFieldKey
    setPrefilledFields((current) =>
      current[essentialField] ? { ...current, [essentialField]: false } : current
    )
  }, [])

  const clearPrefillFlags = useCallback(() => {
    setPrefilledFields(EMPTY_PREFILL_FLAGS)
  }, [])

  return {
    prefilledFields,
    markFieldEdited,
    clearPrefillFlags,
  }
}
