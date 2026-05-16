'use client'

import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from 'react'
import type { ManualValuationFormData } from '../../../types/valuation'
import type { TerminalValueMethod } from '../sections/DcfGlobalAssumptions'

function getInitialTerminalValueMethod(formData: ManualValuationFormData): TerminalValueMethod {
  if (formData.dcf_terminal_value_method) return formData.dcf_terminal_value_method
  if (formData.dcf_exit_multiple != null && formData.dcf_terminal_growth_pct == null) {
    return 'exit_multiple'
  }
  return 'perpetual_growth'
}

interface UseManualDcfTerminalValueMethodParams {
  formData: ManualValuationFormData
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
}

export function useManualDcfTerminalValueMethod({
  formData,
  setFormData,
}: UseManualDcfTerminalValueMethodParams) {
  const [terminalValueMethod, setTerminalValueMethod] = useState<TerminalValueMethod>(() =>
    getInitialTerminalValueMethod(formData)
  )

  const handleTerminalValueMethodChange = useCallback(
    (method: TerminalValueMethod) => {
      setTerminalValueMethod(method)
      setFormData((prev) => ({ ...prev, dcf_terminal_value_method: method }))
    },
    [setFormData]
  )

  useEffect(() => {
    if (formData.dcf_input_mode !== 'fcff_only') return
    if (terminalValueMethod !== 'exit_multiple') return
    setTerminalValueMethod('perpetual_growth')
    setFormData((prev) => ({ ...prev, dcf_terminal_value_method: 'perpetual_growth' }))
  }, [formData.dcf_input_mode, terminalValueMethod, setFormData])

  const markPerpetualGrowthWhenFcffOnly = useCallback(() => {
    setTerminalValueMethod('perpetual_growth')
  }, [])

  return {
    handleTerminalValueMethodChange,
    markPerpetualGrowthWhenFcffOnly,
    terminalValueMethod,
  }
}
