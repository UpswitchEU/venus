import { FinancialDecimal } from './financialDecimal'

export type DecimalInputLocale = 'en' | 'nl' | 'fr'

/** Whole-value parsing. An explicit locale resolves ambiguous single separators. */
export function normalizeDecimalSeparators(raw: string, locale?: DecimalInputLocale): string {
  const text = raw.trim()
  if (!text) return ''
  const decimal =
    locale === 'en' ? '.' : locale ? ',' : text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.'
  const group = decimal === ',' ? '.' : ','
  const escapedDecimal = decimal === '.' ? '\\.' : ','
  const escapedGroup = group === '.' ? '\\.' : ','
  const plain = new RegExp(`^[+-]?(?:\\d+(?:${escapedDecimal}\\d*)?|${escapedDecimal}\\d+)$`)
  const grouped = new RegExp(`^[+-]?\\d{1,3}(?:${escapedGroup}\\d{3})+(?:${escapedDecimal}\\d*)?$`)
  const spaced = new RegExp(`^[+-]?\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+(?:${escapedDecimal}\\d*)?$`)
  if (!plain.test(text) && !grouped.test(text) && !spaced.test(text)) return ''
  return text
    .replace(new RegExp(escapedGroup, 'g'), '')
    .replace(/[ \u00a0\u202f]/g, '')
    .replace(decimal, '.')
}

/** Exact committed decimal, in currency units. Formatting never becomes arithmetic. */
export function parseDecimalText(raw: string, locale?: DecimalInputLocale): string | undefined {
  if (raw.length > 100) return undefined
  const text = normalizeDecimalSeparators(raw, locale)
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return undefined
  const value = new FinancialDecimal(text)
  if (!value.isFinite() || value.abs().gte('1e18') || value.decimalPlaces() > 8) return undefined
  return value.toFixed()
}

/** Compatibility for numeric controls: never silently round an exact input. */
export function parseDecimalTextInput(
  raw: string,
  locale?: DecimalInputLocale
): number | undefined {
  const text = parseDecimalText(raw, locale)
  if (text === undefined) return undefined
  const number = Number(text)
  return Number.isFinite(number) && new FinancialDecimal(number).eq(text) ? number : undefined
}
