export type ManualYearlyFinancialField =
  | 'revenue'
  | 'ebitda'
  | 'capex'
  | 'depreciation'
  | 'nwc_change'
  | 'free_cash_flow'

export type UpdateManualYearlyFinancials = (
  year: string,
  isForecast: boolean,
  field: ManualYearlyFinancialField,
  value: number | undefined
) => void
