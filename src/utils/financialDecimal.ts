import Decimal from 'decimal.js'

/** Isolated precision: another screen's Decimal.set must not change financial input bridges. */
export const FinancialDecimal = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_EVEN })
