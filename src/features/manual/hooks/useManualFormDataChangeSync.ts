import { type MutableRefObject, useCallback } from 'react'
import { useManualFormStore } from '../../../store/manual'
import { storeReflectsBridgeMapped } from '../../../utils/storeReflectsBridgeMapped'
import { hasFinancialInputsChangedSinceSubmit } from '../utils/manualFinancialChanges'
import type { SubmittedFinancialSnapshot } from '../utils/manualFinancialSnapshot'
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

      setIsDirty(hasFinancialInputsChangedSinceSubmit(latestFormDataRef.current, snapshot))
    },
    [lastSubmittedFinancialSnapshotRef, latestFormDataRef, result, setIsDirty, updateFormData]
  )

  return { handleFormDataChange }
}
