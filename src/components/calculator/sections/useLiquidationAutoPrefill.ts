import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  LiquidationEssentialFieldKey,
  LiquidationNumericFieldKey,
} from '@/lib/methods/liquidation_analysis/liquidationInputConfig'
import { buildLiquidationPrefillPatches } from '@/lib/methods/liquidation_analysis/liquidationInputModel'

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
  onFieldChange: (field: LiquidationNumericFieldKey, value: number | undefined) => void
}

const EMPTY_PREFILL_FLAGS: PrefillFlags = {
  liq_deferred_tax: false,
  liq_headcount: false,
  liq_monthly_rent: false,
  liq_paid_up_capital: false,
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
  const prefilledFieldsRef = useRef<PrefillFlags>(EMPTY_PREFILL_FLAGS)

  useEffect(() => {
    const patches = buildLiquidationPrefillPatches({
      currentValues: {
        liqHeadcount,
        liqMonthlyRent,
        liqPaidUpCapital,
        liqDeferredTax,
      },
      sourceValues: {
        prefillSourceHeadcount,
        prefillSourceAnnualRent,
        prefillSourcePaidUpCapital,
        prefillSourceDeferredTax,
      },
      appliedFields: prefilledFieldsRef.current,
    })

    if (patches.length === 0) return

    const nextPrefilledFields = { ...prefilledFieldsRef.current }
    for (const patch of patches) {
      nextPrefilledFields[patch.field as LiquidationEssentialFieldKey] = true
    }
    prefilledFieldsRef.current = nextPrefilledFields
    setPrefilledFields(nextPrefilledFields)

    for (const patch of patches) {
      onFieldChange(patch.field, patch.value)
    }
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
  ])

  const markFieldEdited = useCallback((field: LiquidationNumericFieldKey) => {
    if (!(field in EMPTY_PREFILL_FLAGS)) return
    const essentialField = field as LiquidationEssentialFieldKey
    if (!prefilledFieldsRef.current[essentialField]) return
    const nextPrefilledFields = { ...prefilledFieldsRef.current, [essentialField]: false }
    prefilledFieldsRef.current = nextPrefilledFields
    setPrefilledFields(nextPrefilledFields)
  }, [])

  const clearPrefillFlags = useCallback(() => {
    prefilledFieldsRef.current = EMPTY_PREFILL_FLAGS
    setPrefilledFields(EMPTY_PREFILL_FLAGS)
  }, [])

  return {
    prefilledFields,
    markFieldEdited,
    clearPrefillFlags,
  }
}
