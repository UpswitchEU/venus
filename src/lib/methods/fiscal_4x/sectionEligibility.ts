const FISCAL_INPUTS_BONUS_SECTION = 'fiscal_inputs'

export function shouldMountFiscalReferenceSectionStack({
  firmCountryCode,
  bonusSections,
}: {
  methods: readonly string[]
  firmCountryCode?: string
  bonusSections: readonly string[]
}): boolean {
  const normalizedFirmCountry = firmCountryCode?.trim().toUpperCase()
  if (normalizedFirmCountry === 'NL') return false

  return bonusSections.includes(FISCAL_INPUTS_BONUS_SECTION)
}

export function shouldRenderFiscalInputs(bonusSections: readonly string[]): boolean {
  return bonusSections.includes(FISCAL_INPUTS_BONUS_SECTION)
}
