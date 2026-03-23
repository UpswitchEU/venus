export const SHAREHOLDING_MIN = 0
export const SHAREHOLDING_MAX = 100
export const SHAREHOLDING_DECIMALS = 2
const SHAREHOLDING_INPUT_PATTERN = /^\d+(?:[.,]\d+)?$/

function normalizeRawValue(value: string): string {
  return value.trim().replace(',', '.')
}

export function parseShareholdingInput(value: string): number | undefined {
  const normalized = normalizeRawValue(value)
  if (normalized === '') {
    return undefined
  }
  if (!SHAREHOLDING_INPUT_PATTERN.test(value.trim())) {
    return undefined
  }

  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function hasAtMostTwoShareholdingDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < Number.EPSILON * 100
}

export function isShareholdingValueInRange(value: number): boolean {
  return Number.isFinite(value) && value >= SHAREHOLDING_MIN && value <= SHAREHOLDING_MAX
}

export function isValidShareholdingValue(value: number): boolean {
  return isShareholdingValueInRange(value) && hasAtMostTwoShareholdingDecimals(value)
}

export function formatShareholdingInput(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return ''
  }

  return value.toFixed(SHAREHOLDING_DECIMALS)
}

export function formatShareholdingToast(value: number): string {
  return `${formatShareholdingInput(value)}%`
}
