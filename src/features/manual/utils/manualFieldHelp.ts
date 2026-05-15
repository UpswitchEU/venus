import type { FieldContext, FieldHelpContext } from '@/components/calculator'

export type ManualFieldHelpLocale = 'en' | 'nl' | string

export function buildManualFieldContext(context: FieldHelpContext): FieldContext {
  return {
    field: context.field,
    label: context.label,
    value: context.value,
    hint: context.hint,
  }
}

export function buildManualFieldHelpQuestion(
  context: FieldHelpContext,
  locale: ManualFieldHelpLocale
): string {
  const label = (context.label || '').toLowerCase()
  const isEN = locale === 'en'

  if (context.normalizationType) {
    switch (context.normalizationType) {
      case 'salary':
        return isEN
          ? `What is a market-rate salary for ${label}?`
          : `Wat is een marktconform salaris voor ${label}?`
      case 'rent':
        return isEN
          ? `Is the rent for ${label} at market rate?`
          : `Is de huurprijs voor ${label} marktconform?`
      case 'vehicle':
        return isEN
          ? `How much private use can be normalized for ${label}?`
          : `Hoeveel privégebruik kan genormaliseerd worden voor ${label}?`
      case 'one-time':
        return isEN
          ? `Is ${label} a one-time cost that should be normalized?`
          : `Is ${label} een eenmalige kost die genormaliseerd moet worden?`
      case 'personal':
        return isEN
          ? `What portion of ${label} is personal?`
          : `Welk deel van ${label} is privégerelateerd?`
    }
  }

  switch (context.field) {
    case 'ownerManagers':
      return isEN
        ? 'How many owner-managers is typical for this type of business?'
        : 'Hoeveel eigenaar-managers is gebruikelijk voor dit type bedrijf?'
    case 'ebitda':
      return isEN
        ? `Which normalizations are relevant for the EBITDA of ${context.label}?`
        : `Welke normalisaties zijn relevant voor de EBITDA van ${context.label}?`
    case 'ownerSalary':
      return isEN
        ? 'What is a market-rate owner salary for this business?'
        : 'Wat is een marktconform eigenaarssalaris voor dit bedrijf?'
    case 'rent':
      return isEN ? 'Is this rent at market rate?' : 'Is deze huurprijs marktconform?'
    case 'vehicle':
      return isEN
        ? 'How much private use can be normalized for vehicle costs?'
        : 'Hoeveel privégebruik kan genormaliseerd worden voor autokosten?'
    default:
      if (context.grootboekCode) {
        return isEN
          ? `Analyze ledger account ${context.grootboekCode} (${context.label}) for normalization`
          : `Analyseer grootboekrekening ${context.grootboekCode} (${context.label}) voor normalisatie`
      }
      return isEN ? `Help me with ${label}` : `Help me met ${label}`
  }
}
