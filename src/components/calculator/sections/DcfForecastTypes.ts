export interface DcfForecastRow {
  year: string
  revenue: number
  ebitda: number
  capex?: number
  depreciation?: number
  nwc_change?: number
  /** Explicit FCFF when using "zonder EBITDA" mode. */
  free_cash_flow?: number
  isForecast?: boolean
}
