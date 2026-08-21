import { describe, expect, it } from 'vitest'

import { buildCurrentYearData, mergeYearDataRows } from '@/utils/yearData'
import type { YearDataInput } from '@/types/valuation'

/**
 * A connected client's imported year carries the whole balance sheet. These tests
 * pin that it survives the trip into the valuation payload.
 *
 * It previously did not: both helpers read optional cells ONLY from the row the
 * session already held, so a freshly imported balance sheet was narrowed to
 * `{year, revenue, ebitda}`. The thin result was then written back to the
 * session, leaving nothing to restore from on the next pass either. Downstream
 * that produced an EV→equity bridge with no cash and no debt, twelve null
 * ratios, and a report telling a fully-connected advisor to connect his
 * accounting.
 */

// A real imported fiscal year, shaped as the manual panel carries it.
const IMPORTED_YEAR = {
  year: '2025',
  revenue: 10_501_716.8,
  ebitda: 271_127.49,
  operating_revenue: 10_501_716.8,
  total_assets: 1_751_205.61,
  total_equity: 976_038.5,
  total_liabilities: 775_167.11,
  cash: 314_966.46,
  total_debt: 0,
  short_term_debt: 0,
  accounts_receivable: 402_118.24,
  accounts_payable: 651_233.9,
  interest_expense: 3_897.79,
  tax_expense: 54_311.69,
  cogs: 9_918_016.68,
  operating_expenses: 312_572.63,
}

const BALANCE_SHEET_CELLS = [
  'total_assets',
  'total_equity',
  'total_liabilities',
  'cash',
  'total_debt',
  'accounts_receivable',
  'accounts_payable',
] as const

describe('mergeYearDataRows — imported cells survive', () => {
  it('carries the balance sheet from the incoming row', () => {
    const [row] = mergeYearDataRows([IMPORTED_YEAR], [])

    expect(row.year).toBe(2025)
    for (const cell of BALANCE_SHEET_CELLS) {
      expect(row[cell], `${cell} was dropped`).toBe(
        IMPORTED_YEAR[cell as keyof typeof IMPORTED_YEAR]
      )
    }
    expect(row.operating_revenue).toBe(10_501_716.8)
  })

  it('lets a fresh import overwrite a stale session value', () => {
    const stale: Partial<YearDataInput> = { year: 2025, cash: 1, total_equity: 2 }
    const [row] = mergeYearDataRows([IMPORTED_YEAR], [stale])

    expect(row.cash).toBe(314_966.46)
    expect(row.total_equity).toBe(976_038.5)
  })

  it('still falls back to the session when the incoming row omits a cell', () => {
    const thin = { year: '2025', revenue: 10_501_716.8, ebitda: 271_127.49 }
    const existing: Partial<YearDataInput> = { year: 2025, cash: 314_966.46 }
    const [row] = mergeYearDataRows([thin], [existing])

    expect(row.cash).toBe(314_966.46)
  })

  it('does not invent cells the caller never supplied', () => {
    const thin = { year: '2025', revenue: 100, ebitda: 10 }
    const [row] = mergeYearDataRows([thin], [])

    expect(row.total_assets).toBeUndefined()
    expect(row.total_debt).toBeUndefined()
  })
})

describe('buildCurrentYearData — imported cells survive', () => {
  it('reads the balance sheet from the source row', () => {
    const row = buildCurrentYearData({
      year: 2025,
      revenue: 10_501_716.8,
      ebitda: 271_127.49,
      currentYearData: undefined,
      sourceRow: IMPORTED_YEAR as unknown as Partial<YearDataInput>,
    })

    for (const cell of BALANCE_SHEET_CELLS) {
      expect(row[cell], `${cell} was dropped`).toBe(
        IMPORTED_YEAR[cell as keyof typeof IMPORTED_YEAR]
      )
    }
  })

  it('prefers the source row over the stored session copy', () => {
    const row = buildCurrentYearData({
      year: 2025,
      revenue: 10_501_716.8,
      ebitda: 271_127.49,
      currentYearData: { year: 2025, cash: 1 },
      sourceRow: IMPORTED_YEAR as unknown as Partial<YearDataInput>,
    })

    expect(row.cash).toBe(314_966.46)
  })

  it('keeps the session copy when no source row is given', () => {
    const row = buildCurrentYearData({
      year: 2025,
      revenue: 10_501_716.8,
      ebitda: 271_127.49,
      currentYearData: { year: 2025, cash: 42 },
    })

    expect(row.cash).toBe(42)
  })
})
