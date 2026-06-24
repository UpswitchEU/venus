'use client'

import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from 'react'
import type { ManualValuationFormData } from '../../../types/valuation'
import { parseFlexibleNumber } from '../../../utils/isFiniteNumeric'
import type { TerminalValueMethod } from '../sections/DcfGlobalAssumptions'

function isTerminalValueMethod(value: unknown): value is TerminalValueMethod {
  return value === 'perpetual_growth' || value === 'exit_multiple'
}

function getInitialTerminalValueMethod(formData: ManualValuationFormData): TerminalValueMethod {
  if (isTerminalValueMethod(formData.dcf_terminal_value_method)) {
    return formData.dcf_terminal_value_method
  }

  const exitMultiple = parseFlexibleNumber(formData.dcf_exit_multiple)
  const terminalGrowthPct = parseFlexibleNumber(formData.dcf_terminal_growth_pct)
  if (exitMultiple != null && terminalGrowthPct == null) {
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
      setTerminalValueMethod((prev) => (prev === method ? prev : method))
      setFormData((prev) =>
        prev.dcf_terminal_value_method === method ? prev : { ...prev, dcf_terminal_value_method: method }
      )
    },
    [setFormData]
  )

  useEffect(() => {
    if (formData.dcf_input_mode !== 'fcff_only') return
    if (terminalValueMethod !== 'exit_multiple') return
    setTerminalValueMethod('perpetual_growth')
    setFormData((prev) =>
      prev.dcf_terminal_value_method === 'perpetual_growth'
        ? prev
        : { ...prev, dcf_terminal_value_method: 'perpetual_growth' }
    )
  }, [formData.dcf_input_mode, terminalValueMethod, setFormData])

  const markPerpetualGrowthWhenFcffOnly = useCallback(() => {
    setTerminalValueMethod((prev) => (prev === 'perpetual_growth' ? prev : 'perpetual_growth'))
  }, [])

  return {
    handleTerminalValueMethodChange,
    markPerpetualGrowthWhenFcffOnly,
    terminalValueMethod,
  }
}
