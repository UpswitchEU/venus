import { useMemo } from 'react'
import {
  filterPreSelectableMethodsForOwnerFounder,
  showAdvisorCalculatorSurface,
} from '../../../constants/accountantPlanMethods'
import type { PlanFeatureFlags } from '../../../hooks/useCredits'
import { useUpfrontMethodNavInputs } from '../../../hooks/useUpfrontMethodNavInputs'
import { isVenturePathMethodKey } from '../../../lib/methods'
import type { ValuationFormData } from '../../../types/valuation'

interface UseManualMethodAccessStateParams {
  allowedMethodKeys: string[] | null
  firmCountryCode?: string | null
  formStoreData: ValuationFormData
  isAccountantFlow: boolean
  isAccountantMode: boolean
  planFeatures: PlanFeatureFlags | null
  preSelectedMethod?: string | null
  selectedMethod?: string | null
  userRole?: string | null
}

export function useManualMethodAccessState({
  allowedMethodKeys,
  firmCountryCode,
  formStoreData,
  isAccountantFlow,
  isAccountantMode,
  planFeatures,
  preSelectedMethod,
  selectedMethod,
  userRole,
}: UseManualMethodAccessStateParams) {
  const { currentYearRevenueForMethodNav, preSelectableMethodsForNav: firmPreSelectableMethods } =
    useUpfrontMethodNavInputs(formStoreData, firmCountryCode)

  const showFullAdvisorMethodNav = showAdvisorCalculatorSurface(isAccountantFlow, userRole)
  const preSelectableMethodsForNav = useMemo(
    () =>
      filterPreSelectableMethodsForOwnerFounder(firmPreSelectableMethods, showFullAdvisorMethodNav),
    [firmPreSelectableMethods, showFullAdvisorMethodNav]
  )
  const planLockedMethodKeys = useMemo(() => {
    if (allowedMethodKeys === null) return undefined
    const allowed = new Set(allowedMethodKeys)
    const next = new Set<string>()
    for (const method of preSelectableMethodsForNav) {
      if (!allowed.has(method)) next.add(method)
    }
    return next.size > 0 ? next : undefined
  }, [allowedMethodKeys, preSelectableMethodsForNav])

  const effectiveMethod = preSelectedMethod ?? selectedMethod

  return {
    canDownloadPdf:
      planFeatures?.valuation_download !== false ||
      (userRole === 'seller' && !isAccountantFlow && isVenturePathMethodKey(effectiveMethod)),
    currentYearRevenueForMethodNav,
    ebitdaNormalizationLocked: Boolean(planFeatures && !planFeatures.ebitda_normalization),
    planLockedMethodKeys,
    preSelectableMethodsForNav,
    showFullAdvisorMethodNav,
    showPreparerMultiplePanel: showFullAdvisorMethodNav || isAccountantMode,
    versionControlLocked: Boolean(planFeatures && !planFeatures.version_control),
  }
}
