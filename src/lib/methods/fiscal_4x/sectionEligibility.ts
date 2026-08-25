const FISCAL_INPUTS_BONUS_SECTION = 'fiscal_inputs'

export function shouldMountFiscalReferenceSectionStack({
  bonusSections,
}: {
  methods: readonly string[]
  firmCountryCode?: string
  bonusSections: readonly string[]
}): boolean {
  return bonusSections.includes(FISCAL_INPUTS_BONUS_SECTION)
}

export function shouldRenderFiscalInputs(bonusSections: readonly string[]): boolean {
  return bonusSections.includes(FISCAL_INPUTS_BONUS_SECTION)
}
