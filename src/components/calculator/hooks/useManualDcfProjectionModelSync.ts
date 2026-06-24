'use client'

import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef } from 'react'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import { coerceFiniteNumber } from '../../../utils/isFiniteNumeric'
import type { DcfForecastModelSnapshot } from '../sections/dcfForecastModelSync'
import {
  deriveManualDcfProjectionRowsFromForm,
  syncManualDcfForecastRowsFromProjection,
} from '../utils/manualDcfForecastTransforms'

interface UseManualDcfProjectionModelSyncParams {
  formData: ManualValuationFormData
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
  hasDcfSelected: boolean
  dcfForecastRows: YearlyFinancials[]
}

export function useManualDcfProjectionModelSync({
  formData,
  setFormData,
  hasDcfSelected,
  dcfForecastRows,
}: UseManualDcfProjectionModelSyncParams) {
  const dcfLastModelSnapshotRef = useRef<Record<string, DcfForecastModelSnapshot>>({})

  const dcfForecastYearKeys = useMemo(
    () =>
      dcfForecastRows
        .map((row) => String(row.year))
        .sort()
        .join(','),
    [dcfForecastRows]
  )

  useEffect(() => {
    const allowed = new Set(dcfForecastYearKeys.length > 0 ? dcfForecastYearKeys.split(',') : [])
    const next: Record<string, DcfForecastModelSnapshot> = {}
    for (const key of Object.keys(dcfLastModelSnapshotRef.current)) {
      if (allowed.has(key)) next[key] = dcfLastModelSnapshotRef.current[key]
    }
    dcfLastModelSnapshotRef.current = next
  }, [dcfForecastYearKeys])

  useEffect(() => {
    if (formData.dcf_input_mode === 'fcff_only') {
      dcfLastModelSnapshotRef.current = {}
    }
  }, [formData.dcf_input_mode])

  useEffect(() => {
    // Trigger-only assumption reads: the updater uses the freshest form
    // snapshot, but these fields must still re-run projection sync when edited.
    void formData.dcf_revenue_growth_pct
    void formData.dcf_ebitda_margin_pct
    void formData.dcf_capex_pct
    void formData.dcf_da_pct
    void formData.dcf_nwc_pct
    void formData.dcf_tax_rate_pct
    void dcfForecastYearKeys

    if (!hasDcfSelected || formData.dcf_input_mode === 'fcff_only') return
    if (dcfForecastRows.length === 0) return

    setFormData((prev) => {
      const growth = coerceFiniteNumber(prev.dcf_revenue_growth_pct)
      const margin = coerceFiniteNumber(prev.dcf_ebitda_margin_pct)
      if (growth == null || margin == null) {
        return prev
      }

      const projectionRows = deriveManualDcfProjectionRowsFromForm(prev)
      if (projectionRows.length === 0) return prev

      const syncResult = syncManualDcfForecastRowsFromProjection({
        yearlyFinancials: prev.yearlyFinancials,
        projectionRows,
        previousModelSnapshots: dcfLastModelSnapshotRef.current,
      })
      dcfLastModelSnapshotRef.current = syncResult.modelSnapshots

      if (!syncResult.changed) return prev
      return { ...prev, yearlyFinancials: syncResult.yearlyFinancials }
    })
  }, [
    hasDcfSelected,
    formData.dcf_input_mode,
    formData.dcf_revenue_growth_pct,
    formData.dcf_ebitda_margin_pct,
    formData.dcf_capex_pct,
    formData.dcf_da_pct,
    formData.dcf_nwc_pct,
    formData.dcf_tax_rate_pct,
    dcfForecastYearKeys,
    dcfForecastRows.length,
    setFormData,
  ])
}
