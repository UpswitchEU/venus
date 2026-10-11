import { updateManualYearlyFinancialsRows } from '@/components/calculator/utils/manualFinancialRowMutations'
import type { ManualYearlyFinancialField } from '@/components/calculator/utils/manualYearlyFinancialUpdates'
import type { ManualValuationFormData } from '@/types/valuation'
import { parseFinancialTransportNumber } from '@/utils/financialTransport'
import { buildManualChatFieldUpdateBridge } from './manualChatFieldUpdate'

const FINANCIAL_FIELDS = new Set<ManualYearlyFinancialField>([
  'revenue',
  'ebitda',
  'capex',
  'depreciation',
  'nwc_change',
  'free_cash_flow',
])

/** Use the same row mutation as manual input; never write just a chat-local value. */
export function buildManualChatInputPatch(
  form: Partial<ManualValuationFormData>,
  field: string,
  value: unknown
): Partial<ManualValuationFormData> | null {
  const match = field.match(/^([a-z_]+)(?:\.(\d{4}))?$/i)
  const key = match?.[1] as ManualYearlyFinancialField
  if (FINANCIAL_FIELDS.has(key)) {
    const amount = parseFinancialTransportNumber(value)
    if (amount === undefined || (['revenue', 'capex', 'depreciation'].includes(key) && amount < 0))
      return null
    const rows = form.yearlyFinancials ?? []
    const year =
      match?.[2] ??
      [...rows].filter((row) => !row.isForecast).sort((a, b) => Number(b.year) - Number(a.year))[0]
        ?.year
    const target = rows.find((row) => String(row.year) === String(year) && !row.isForecast)
    // A missing year needs a question, not an invented fiscal period.
    if (!target) return null
    return {
      yearlyFinancials: updateManualYearlyFinancialsRows({
        yearlyFinancials: rows,
        field: key,
        year: String(year),
        isForecast: false,
        value: amount,
      }),
    }
  }
  const bridge = buildManualChatFieldUpdateBridge(field, value)
  if (!Object.keys(bridge.formPatch).length) return null
  return {
    ...bridge.formPatch,
    ...(bridge.collectedDataKey ? { [bridge.collectedDataKey]: value } : {}),
    ...(bridge.formPatch.founding_year !== undefined
      ? { yearFounded: String(bridge.formPatch.founding_year) }
      : {}),
    ...(bridge.formPatch.number_of_employees !== undefined
      ? { fteEmployees: bridge.formPatch.number_of_employees }
      : {}),
  }
}
