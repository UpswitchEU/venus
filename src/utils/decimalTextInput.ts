/**
 * Shared decimal parsing for controlled text inputs (%, currency amounts, FCFF, etc.).
 * Handles nl-BE comma decimals and trailing "." / "," while typing.
 */

/**
 * Normalize decimal separator: last comma after last dot → decimal comma (e.g. 1.234,5).
 * Otherwise map commas to dots.
 */
export function normalizeDecimalSeparators(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  const lastComma = t.lastIndexOf(',')
  const lastDot = t.lastIndexOf('.')
  if (lastComma > lastDot) {
    const intPart = t.slice(0, lastComma).replace(/\./g, '').replace(/,/g, '')
    const fracPart = t.slice(lastComma + 1).replace(/,/g, '')
    return `${intPart}.${fracPart}`
  }
  return t.replace(/,/g, '.')
}

/**
 * Parse a decimal text field while typing (percents, FCFF amounts, etc.).
 */
export function parseDecimalTextInput(raw: string): number | undefined {
  const t = normalizeDecimalSeparators(raw)
  if (t === '' || t === '-' || t === '.' || t === '-.') return undefined
  if (t.endsWith('.')) {
    const head = t.slice(0, -1)
    if (head === '' || head === '-') return undefined
    const n = Number.parseFloat(head)
    return Number.isNaN(n) ? undefined : n
  }
  const n = Number.parseFloat(t)
  return Number.isNaN(n) ? undefined : n
}
