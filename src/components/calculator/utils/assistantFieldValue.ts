const MONEY_FIELDS = new Set([
  'revenue',
  'ebitda',
  'capex',
  'depreciation',
  'nwc_change',
  'free_cash_flow',
  'ownerSalary',
  'owner_salary_addback',
  'cash',
  'debt',
  'net_debt',
])

export function formatAssistantFieldValue(field: string, value: unknown, locale: string): string {
  if (typeof value !== 'number') return String(value ?? '')
  const key = field.split('.')[0]
  if (['founding_year', 'foundingYear', 'yearFounded'].includes(key)) return String(value)
  const formatted = value.toLocaleString(locale, { maximumFractionDigits: 2 })
  return MONEY_FIELDS.has(key) ? `€${formatted}` : formatted
}
