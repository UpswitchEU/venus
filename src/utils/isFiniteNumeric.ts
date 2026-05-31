/** Parse persisted form/session numbers, including Belgian/Dutch display strings. */
export function parseFlexibleNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined

  let text = value.trim()
  if (!text) return undefined

  const isParenthesizedNegative = /^\(.*\)$/.test(text)
  if (isParenthesizedNegative) text = `-${text.slice(1, -1)}`

  text = text
    .replace(/\u2212/g, '-')
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/[€$£%]/g, '')
    .replace(/'/g, '')
    .replace(/[^0-9,.\-+]/g, '')

  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  let normalized = text

  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '')
  } else if (lastDot >= 0 && /^[+-]?\d{1,3}(\.\d{3})+$/.test(text)) {
    normalized = text.replace(/\./g, '')
  } else if (lastComma >= 0) {
    normalized = /^[+-]?\d{1,3}(,\d{3})+$/.test(text)
      ? text.replace(/,/g, '')
      : text.replace(',', '.')
  }

  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(normalized)) return undefined

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Treat persisted form/session numbers that may arrive as numeric strings. */
export function isFiniteNumeric(value: unknown): value is number | string {
  return parseFlexibleNumber(value) !== undefined
}

export function coerceFiniteNumber(value: unknown): number | undefined {
  return parseFlexibleNumber(value)
}
