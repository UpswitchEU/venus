import { type MutableRefObject, useCallback } from 'react'
import { useManualFormStore } from '../../../store/manual'
import { storeReflectsBridgeMapped } from '../../../utils/storeReflectsBridgeMapped'
import { getLatestCompleteYearlyFinancial } from '../../../utils/yearlyFinancials'
import type {
  SubmittedFinancialSnapshot,
  SubmittedFinancialYear,
} from '../utils/manualFinancialSnapshot'
import { mapClarityFormToVenusStore } from '../utils/manualFormMapper'

type ManualFormDataPatch = ReturnType<typeof mapClarityFormToVenusStore>

export interface UseManualFormDataChangeSyncParams<TCollectedData extends object> {
  lastSubmittedFinancialSnapshotRef: MutableRefObject<SubmittedFinancialSnapshot | null>
  latestFormDataRef: MutableRefObject<Partial<TCollectedData>>
  result: unknown
  setIsDirty: (isDirty: boolean) => void
  updateFormData: (patch: ManualFormDataPatch) => void
}

export interface UseManualFormDataChangeSyncResult {
  handleFormDataChange: (data: Record<string, unknown>) => void
}

export function useManualFormDataChangeSync<TCollectedData extends object>({
  lastSubmittedFinancialSnapshotRef,
  latestFormDataRef,
  result,
  setIsDirty,
  updateFormData,
}: UseManualFormDataChangeSyncParams<TCollectedData>): UseManualFormDataChangeSyncResult {
  const handleFormDataChange = useCallback(
    (data: Record<string, unknown>) => {
      latestFormDataRef.current = {
        ...latestFormDataRef.current,
        ...(data as Partial<TCollectedData>),
      }

      const mapped = mapClarityFormToVenusStore(
        latestFormDataRef.current,
        useManualFormStore.getState().formData
      )
      const currentForm = useManualFormStore.getState().formData
      if (!storeReflectsBridgeMapped(mapped, currentForm)) {
        updateFormData(mapped)
      }

      if (!result) return

      const snapshot = lastSubmittedFinancialSnapshotRef.current
      if (!snapshot) return

      setIsDirty(hasFinancialInputsChangedSinceSubmit(data, snapshot))
    },
    [lastSubmittedFinancialSnapshotRef, latestFormDataRef, result, setIsDirty, updateFormData]
  )

  return { handleFormDataChange }
}

function hasFinancialInputsChangedSinceSubmit(
  data: Record<string, unknown>,
  snapshot: SubmittedFinancialSnapshot
) {
  const yearlyFinancials = readYearlyFinancials(data.yearlyFinancials)
  const current = getLatestCompleteYearlyFinancial(yearlyFinancials)
  const revenue = current?.revenue ?? (data.revenue as number)
  const ebitda = current?.ebitda ?? (data.ebitda as number)

  const revNum = revenue != null ? Number(revenue) : undefined
  const ebitdaNum = ebitda != null ? Number(ebitda) : undefined
  const snapRev = snapshot.revenue != null ? Number(snapshot.revenue) : undefined
  const snapEbitda = snapshot.ebitda != null ? Number(snapshot.ebitda) : undefined

  const revMatch = revNum === undefined || snapRev === undefined || revNum === snapRev
  const ebitdaMatch =
    ebitdaNum === undefined || snapEbitda === undefined || ebitdaNum === snapEbitda
  const yfMatch = financialYearsMatchSnapshot(yearlyFinancials, snapshot.yearlyFinancials)

  return !(revMatch && ebitdaMatch && yfMatch)
}

function readYearlyFinancials(value: unknown): SubmittedFinancialYear[] {
  return Array.isArray(value) ? (value as SubmittedFinancialYear[]) : []
}

function financialYearsMatchSnapshot(
  yearlyFinancials: SubmittedFinancialYear[],
  snapshotYearlyFinancials: SubmittedFinancialYear[]
) {
  if (yearlyFinancials.length === 0) return true
  return (
    JSON.stringify(normalizeFinancialYears(yearlyFinancials)) ===
    JSON.stringify(normalizeFinancialYears(snapshotYearlyFinancials))
  )
}

function normalizeFinancialYears(years: SubmittedFinancialYear[]) {
  return [...years]
    .sort((a, b) => Number.parseInt(b.year, 10) - Number.parseInt(a.year, 10))
    .map((year) => ({
      y: year.year,
      r: Number(year.revenue),
      e: Number(year.ebitda),
      c: year.capex != null ? Number(year.capex) : null,
      n: year.nwc_change != null ? Number(year.nwc_change) : null,
      f: Boolean(year.isForecast),
    }))
}
