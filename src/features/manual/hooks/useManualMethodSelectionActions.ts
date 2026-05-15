import { type MutableRefObject, useCallback, useEffect } from 'react'
import { isUpfrontMethodAllowedForNav } from '../../../constants/methodFieldConfig'
import { isAdaptiveMethodKey } from '../../../lib/methods'

interface PendingMethodOverride {
  reason?: string
  note?: string
}

export interface UseManualMethodSelectionActionsParams {
  allowedMethodKeys: readonly string[] | null
  openStarterPaywall: (feature: 'methods') => void
  pendingOverrideRef: MutableRefObject<PendingMethodOverride>
  preSelectableMethodsForNav: readonly string[]
  preSelectedMethod?: string | null
  setPreSelectedMethod: (method: string | null) => void
  setSelectedMethod: (method: string) => void
  togglePreSelectedMethod: (method: string) => void
}

export interface UseManualMethodSelectionActionsResult {
  handleSelectMethodWithOverride: (
    method: string,
    overrideReason?: string,
    overrideNote?: string
  ) => void
  handlePlanLockedMethodAction: () => void
  togglePreSelectedMethodWithPlanGate: (method: string) => void
  handlePreSelectMethod: (method: string) => void
}

export function useManualMethodSelectionActions({
  allowedMethodKeys,
  openStarterPaywall,
  pendingOverrideRef,
  preSelectableMethodsForNav,
  preSelectedMethod,
  setPreSelectedMethod,
  setSelectedMethod,
  togglePreSelectedMethod,
}: UseManualMethodSelectionActionsParams): UseManualMethodSelectionActionsResult {
  const handleSelectMethodWithOverride = useCallback(
    (method: string, overrideReason?: string, overrideNote?: string) => {
      pendingOverrideRef.current = { reason: overrideReason, note: overrideNote }
      setSelectedMethod(method)
    },
    [pendingOverrideRef, setSelectedMethod]
  )

  const handlePlanLockedMethodAction = useCallback(() => {
    openStarterPaywall('methods')
  }, [openStarterPaywall])

  const togglePreSelectedMethodWithPlanGate = useCallback(
    (method: string) => {
      if (allowedMethodKeys !== null && !allowedMethodKeys.includes(method)) {
        openStarterPaywall('methods')
        return
      }
      togglePreSelectedMethod(method)
    },
    [allowedMethodKeys, openStarterPaywall, togglePreSelectedMethod]
  )

  const handlePreSelectMethod = useCallback(
    (method: string) => {
      if (!isUpfrontMethodAllowedForNav(method, preSelectableMethodsForNav)) return
      if (allowedMethodKeys !== null && !allowedMethodKeys.includes(method)) {
        openStarterPaywall('methods')
        return
      }
      setPreSelectedMethod(isAdaptiveMethodKey(method) ? null : method)
    },
    [allowedMethodKeys, openStarterPaywall, preSelectableMethodsForNav, setPreSelectedMethod]
  )

  useEffect(() => {
    if (
      preSelectedMethod &&
      !isUpfrontMethodAllowedForNav(preSelectedMethod, preSelectableMethodsForNav)
    ) {
      setPreSelectedMethod(null)
    }
  }, [preSelectableMethodsForNav, preSelectedMethod, setPreSelectedMethod])

  return {
    handleSelectMethodWithOverride,
    handlePlanLockedMethodAction,
    togglePreSelectedMethodWithPlanGate,
    handlePreSelectMethod,
  }
}
