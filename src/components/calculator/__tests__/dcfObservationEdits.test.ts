import { describe, expect, it } from 'vitest'
import { availableFinancialNumber } from '@/utils/financialObservations'
import { snapshotFromForecastRowLike } from '../sections/dcfForecastModelSync'
import {
  applyDcfProjectionPreviewToForecastRows,
  buildProjectionRowFromForecastRow,
} from '../sections/dcfProjectionPreview'
import { updateManualYearlyFinancialsRows } from '../utils/manualFinancialRowMutations'

const placeholder = {
  year: '2026',
  isForecast: true,
  revenue: 0,
  ebitda: 0,
  financial_observations: { revenue: 'missing', ebitda: 'missing' } as const,
}

describe('forecast input edits and observation status', () => {
  it.each([
    0, 125.35, -12.5,
  ])('makes an explicit %s edit usable without changing another field status', (value) => {
    const [edited] = updateManualYearlyFinancialsRows({
      yearlyFinancials: [placeholder],
      year: '2026',
      isForecast: true,
      field: 'ebitda',
      value,
    })
    expect(availableFinancialNumber(edited, 'ebitda')).toBe(value)
    expect(edited.financial_observations).toEqual({ revenue: 'missing', ebitda: 'observed' })
  })
  it('records a cleared observed amount as missing through JSON reload', () => {
    const [edited] = updateManualYearlyFinancialsRows({
      yearlyFinancials: [
        { ...placeholder, ebitda: 20, financial_observations: { ebitda: 'observed' } },
      ],
      year: '2026',
      isForecast: true,
      field: 'ebitda',
      value: undefined,
    })
    const restored = JSON.parse(JSON.stringify(edited))
    expect(restored.ebitda).toBeUndefined()
    expect(restored.financial_observations.ebitda).toBe('missing')
  })
  it('identifies explicit model autofill as derived and retains unknown tax', () => {
    const projection = buildProjectionRowFromForecastRow(
      { year: '2026', revenue: 1000, ebitda: 100 },
      { daPct: 3, capexPct: 4, nwcPct: 1.5 }
    )
    const [filled] = applyDcfProjectionPreviewToForecastRows([placeholder], [projection])
    expect(availableFinancialNumber(filled, 'revenue')).toBe(1000)
    expect(availableFinancialNumber(filled, 'ebitda')).toBe(100)
    expect(filled.financial_observations).toMatchObject({ revenue: 'derived', ebitda: 'derived' })
    expect(projection.taxes).toBeNull()
    expect(projection.fcff).toBeNull()
  })
  it('does not equate a missing display zero with an observed zero in model ownership', () => {
    expect(snapshotFromForecastRowLike(placeholder).ebitda).toBeNull()
    expect(snapshotFromForecastRowLike({ ebitda: 0 }).ebitda).toBe(0)
  })
})
