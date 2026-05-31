const BUSINESS_TYPE_ID_ALIASES: Record<string, string> = {
  'fintech-lending-credit': 'fintech-lending',
  fintech_lending_credit: 'fintech-lending',
}

export function normalizeBusinessTypeId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined

  return BUSINESS_TYPE_ID_ALIASES[trimmed.toLowerCase()] ?? trimmed
}
