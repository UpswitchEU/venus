import { FISCAL_4X_METHOD_KEY } from './spec'

const FISCAL_INPUTS_BONUS_SECTION = 'fiscal_inputs'

export function shouldShowFiscalReferenceNotice(
  methods: readonly string[],
  firmCountryCode?: string
): boolean {
  const firmCode = (firmCountryCode ?? 'BE').trim().toUpperCase().substring(0, 2)
  return methods.includes(FISCAL_4X_METHOD_KEY) && firmCode !== 'NL'
}

export function shouldMountFiscalReferenceSectionStack({
  methods,
  firmCountryCode,
  bonusSections,
}: {
  methods: readonly string[]
  firmCountryCode?: string
  bonusSections: readonly string[]
}): boolean {
  return (
    shouldShowFiscalReferenceNotice(methods, firmCountryCode) ||
    bonusSections.includes(FISCAL_INPUTS_BONUS_SECTION)
  )
}

export function shouldRenderFiscalInputs(bonusSections: readonly string[]): boolean {
  return bonusSections.includes(FISCAL_INPUTS_BONUS_SECTION)
}
