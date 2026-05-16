'use client'

import { type Dispatch, type SetStateAction, useEffect } from 'react'
import { useManualFormStore } from '../../../store/manual/useManualFormStore'
import type { ManualValuationFormData } from '../../../types/valuation'
import { mergeOptionalSessionPrefillFields } from '../../../utils/mergeOptionalSessionPrefillFields'

export function useManualOptionalSessionPrefillSync(
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
) {
  useEffect(() => {
    let raf = 0
    const flush = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const storeFormData = useManualFormStore.getState().formData as unknown as Record<
          string,
          unknown
        >
        setFormData((prevLocal) => {
          const patch = mergeOptionalSessionPrefillFields(storeFormData, prevLocal)
          return Object.keys(patch).length > 0 ? { ...prevLocal, ...patch } : prevLocal
        })
      })
    }
    flush()
    const unsubscribe = useManualFormStore.subscribe(flush)
    return () => {
      cancelAnimationFrame(raf)
      unsubscribe()
    }
  }, [setFormData])
}
