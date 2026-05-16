const DCF_PROJECTIONS_BONUS_SECTION = 'dcf_projections'

export function shouldMountDcfGlobalAssumptionsSectionStack({
  bonusSections,
  suppressDcfGlobalAssumptions,
  terminalValueMethod,
  onTerminalValueMethodChange,
  dcfGlobalStep,
}: {
  bonusSections: readonly string[]
  suppressDcfGlobalAssumptions?: boolean
  terminalValueMethod?: string
  onTerminalValueMethodChange?: unknown
  dcfGlobalStep?: number
}): boolean {
  return (
    bonusSections.includes(DCF_PROJECTIONS_BONUS_SECTION) &&
    !suppressDcfGlobalAssumptions &&
    terminalValueMethod != null &&
    onTerminalValueMethodChange != null &&
    dcfGlobalStep != null
  )
}
