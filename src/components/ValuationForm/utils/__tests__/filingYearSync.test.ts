import { describe, expect, it } from 'vitest'
import {
  areMergedYearRowsEqual,
  collectForecastRowsForMerge,
  computeNextHistoricalFromFormData,
  mergeHistoricalAndForecastRows,
  mirrorHistoricalToFormData,
  pickForecastRowsToPreserve,
} from '../filingYearSync'

describe('mirrorHistoricalToFormData (historical row → formData)', () => {
  it('is a no-op when the raw key is absent (initial mount, never typed)', () => {
    expect(mirrorHistoricalToFormData(undefined, undefined)).toEqual({
      changed: false,
      next: undefined,
    })
    expect(mirrorHistoricalToFormData(undefined, 1000)).toEqual({
      changed: false,
      next: 1000,
    })
  })

  it('propagates an explicit clear ("") only when formData currently has a value', () => {
    expect(mirrorHistoricalToFormData('', undefined)).toEqual({
      changed: false,
      next: undefined,
    })
    expect(mirrorHistoricalToFormData('', null)).toEqual({
      changed: false,
      next: undefined,
    })
    expect(mirrorHistoricalToFormData('', 1000)).toEqual({
      changed: true,
      next: undefined,
    })
    expect(mirrorHistoricalToFormData('', 0)).toEqual({
      changed: true,
      next: undefined,
    })
  })

  it('mirrors finite parsed numbers, including 0 and negatives (EBITDA loss is valid)', () => {
    expect(mirrorHistoricalToFormData('1000', undefined)).toEqual({ changed: true, next: 1000 })
    expect(mirrorHistoricalToFormData('1,000,000', undefined)).toEqual({
      changed: true,
      next: 1000000,
    })
    expect(mirrorHistoricalToFormData('0', undefined)).toEqual({ changed: true, next: 0 })
    expect(mirrorHistoricalToFormData('-500', undefined)).toEqual({ changed: true, next: -500 })
  })

  it('is a no-op when the parsed value already matches formData', () => {
    expect(mirrorHistoricalToFormData('1000', 1000)).toEqual({ changed: false, next: 1000 })
    expect(mirrorHistoricalToFormData('1,000', 1000)).toEqual({ changed: false, next: 1000 })
    expect(mirrorHistoricalToFormData('0', 0)).toEqual({ changed: false, next: 0 })
  })

  it('refuses to propagate NaN from a partial typing buffer (preserves formData)', () => {
    // The user is mid-typing; we MUST NOT write `undefined` into formData here,
    // otherwise the reverse sync would immediately wipe the partial buffer.
    expect(mirrorHistoricalToFormData('-', 1000)).toEqual({ changed: false, next: 1000 })
    expect(mirrorHistoricalToFormData('.', 1000)).toEqual({ changed: false, next: 1000 })
    expect(mirrorHistoricalToFormData('-', undefined)).toEqual({
      changed: false,
      next: undefined,
    })
  })

  it('treats parseable trailing-dot inputs ("1.") as their integer prefix (matches parseFloat semantics)', () => {
    // parseFloat("1.") === 1 — JS is lenient about trailing dots. Our mirror
    // therefore writes the integer prefix to formData. The round-trip test
    // below verifies this does not clobber the user's "1." buffer because the
    // reverse step then sees parsed === formValue and stays a no-op.
    expect(mirrorHistoricalToFormData('1.', undefined)).toEqual({ changed: true, next: 1 })
    expect(mirrorHistoricalToFormData('1.', 1)).toEqual({ changed: false, next: 1 })
  })
})

describe('computeNextHistoricalFromFormData (formData → historical row)', () => {
  it('seeds an empty historical row from a finite formData value', () => {
    expect(computeNextHistoricalFromFormData(1000, '')).toBe('1000')
    expect(computeNextHistoricalFromFormData(0, '')).toBe('0')
    expect(computeNextHistoricalFromFormData(-500, '')).toBe('-500')
  })

  it('overwrites a stale parseable historical value when formData changes', () => {
    expect(computeNextHistoricalFromFormData(2000, '1000')).toBe('2000')
    expect(computeNextHistoricalFromFormData(2000, '1,000')).toBe('2000')
  })

  it('is a no-op when historical already matches numerically (formatting differences allowed)', () => {
    expect(computeNextHistoricalFromFormData(1000, '1000')).toBeNull()
    expect(computeNextHistoricalFromFormData(1000, '1,000')).toBeNull()
    expect(computeNextHistoricalFromFormData(0, '0')).toBeNull()
  })

  it('never clobbers a NaN partial typing buffer in the historical row', () => {
    // "-" and "." parse to NaN; writing String(formValue) here would erase the
    // user's keystrokes.
    expect(computeNextHistoricalFromFormData(1000, '-')).toBeNull()
    expect(computeNextHistoricalFromFormData(1000, '.')).toBeNull()
    expect(computeNextHistoricalFromFormData(undefined, '-')).toBeNull()
    expect(computeNextHistoricalFromFormData(null, '.')).toBeNull()
  })

  it('propagates an explicit clear from formData only when historical holds a parseable number', () => {
    expect(computeNextHistoricalFromFormData(undefined, '1000')).toBe('')
    expect(computeNextHistoricalFromFormData(null, '1,000')).toBe('')
    expect(computeNextHistoricalFromFormData(undefined, '0')).toBe('')
  })

  it('does not write when both sides are empty / both sides are absent of value', () => {
    expect(computeNextHistoricalFromFormData(undefined, '')).toBeNull()
    expect(computeNextHistoricalFromFormData(null, '')).toBeNull()
  })

  it('treats non-finite formData values (NaN, Infinity) as "no value"', () => {
    expect(computeNextHistoricalFromFormData(Number.NaN, '')).toBeNull()
    expect(computeNextHistoricalFromFormData(Number.POSITIVE_INFINITY, '1000')).toBe('')
  })
})

describe('round-trip stability (no oscillation between the two sections)', () => {
  // Each scenario simulates the combined effect: forward (historical → formData)
  // then reverse (formData → historical) using the post-forward "effective"
  // value. The reverse step must produce `null` (no further write) — otherwise
  // the two directions would ping-pong indefinitely or wipe user input.
  const runRoundTrip = (
    initialFormValue: number | undefined,
    initialHistRaw: string | undefined
  ) => {
    const mirror = mirrorHistoricalToFormData(initialHistRaw, initialFormValue)
    const effective = mirror.changed ? mirror.next : initialFormValue
    const nextHist = computeNextHistoricalFromFormData(effective, initialHistRaw ?? '')
    return { effective, nextHist, mirrorChanged: mirror.changed }
  }

  it('seeds the historical row from formData.revenue on first render (raw absent), then is stable', () => {
    // Restoration scenario: formData.revenue was loaded from session, but the
    // filing-year historical row was never written (raw === undefined). The
    // forward step is a no-op (must NOT clear formData), the reverse step
    // seeds the row.
    const result = runRoundTrip(5000, undefined)
    expect(result.mirrorChanged).toBe(false)
    expect(result.effective).toBe(5000)
    expect(result.nextHist).toBe('5000')

    // Next render with the seeded value is fully stable.
    const stable = runRoundTrip(5000, '5000')
    expect(stable.mirrorChanged).toBe(false)
    expect(stable.nextHist).toBeNull()
  })

  it('treats raw="" as an explicit clear (distinct from raw=undefined)', () => {
    // After the user has typed in the filing-year row and then cleared it,
    // raw becomes "". This is intentional and must propagate to formData.
    const result = runRoundTrip(5000, '')
    expect(result.mirrorChanged).toBe(true)
    expect(result.effective).toBeUndefined()
    expect(result.nextHist).toBeNull()
  })

  it('does not loop after the user types a complete value into the historical row', () => {
    const result = runRoundTrip(undefined, '1000')
    expect(result.effective).toBe(1000)
    expect(result.nextHist).toBeNull()
  })

  it('does not loop after the user clears the historical row', () => {
    const result = runRoundTrip(1000, '')
    expect(result.effective).toBeUndefined()
    expect(result.nextHist).toBeNull()
  })

  it('does not loop nor wipe input when the user is mid-typing "-" (NaN partial)', () => {
    const result = runRoundTrip(undefined, '-')
    expect(result.mirrorChanged).toBe(false)
    expect(result.effective).toBeUndefined()
    // Reverse must NOT clobber the "-" buffer.
    expect(result.nextHist).toBeNull()
  })

  it('does not wipe a "1." buffer mid-typing even when formData has a stale value', () => {
    // Critical race regression test: if the two effects ran separately, the
    // reverse step would read the stale formData (1000), see the historical
    // buffer "1." parses to 1 (≠ 1000), and overwrite "1." with "1000",
    // erasing the user's keystrokes. Combined into one effect using the
    // effective value, the reverse step sees formValue=1 and parsed=1, match,
    // returns null. Buffer preserved.
    const result = runRoundTrip(1000, '1.')
    expect(result.mirrorChanged).toBe(true)
    expect(result.effective).toBe(1)
    expect(result.nextHist).toBeNull()
  })

  it('handles a multi-keystroke sequence ("", "1", "1.", "1.5") without oscillation', () => {
    // Start: formData=undefined, historical="".
    let formValue: number | undefined = undefined
    let histRaw = ''

    // Tick 1: user types "1".
    histRaw = '1'
    let result = runRoundTrip(formValue, histRaw)
    formValue = result.effective
    if (result.nextHist !== null) histRaw = result.nextHist
    expect(formValue).toBe(1)
    expect(histRaw).toBe('1')

    // Tick 2: user types "1." (still 1).
    histRaw = '1.'
    result = runRoundTrip(formValue, histRaw)
    formValue = result.effective
    if (result.nextHist !== null) histRaw = result.nextHist
    expect(formValue).toBe(1)
    expect(histRaw).toBe('1.') // buffer preserved

    // Tick 3: user types "1.5".
    histRaw = '1.5'
    result = runRoundTrip(formValue, histRaw)
    formValue = result.effective
    if (result.nextHist !== null) histRaw = result.nextHist
    expect(formValue).toBe(1.5)
    expect(histRaw).toBe('1.5')
  })
})

describe('collectForecastRowsForMerge', () => {
  it('keeps only is_forecast rows from historical_years_data', () => {
    const pool = collectForecastRowsForMerge(
      [
        { year: 2023, revenue: 800, ebitda: 80 },
        { year: 2026, revenue: 1500, ebitda: 200, is_forecast: true },
      ],
      undefined
    )
    expect(pool.map((r) => r.year)).toEqual([2026])
  })

  it('adds rows from forecast_years_data when absent on historical', () => {
    const pool = collectForecastRowsForMerge(
      [{ year: 2024, revenue: 1000, ebitda: 100 }],
      [{ year: 2026, revenue: 1500, ebitda: 200 }]
    )
    expect(pool.map((r) => r.year)).toEqual([2026])
    expect(pool.every((r) => r.is_forecast === true)).toBe(true)
  })

  it('prefers embedded historical is_forecast over forecast_years_data for the same year', () => {
    const pool = collectForecastRowsForMerge(
      [{ year: 2026, revenue: 1, ebitda: 1, is_forecast: true }],
      [{ year: 2026, revenue: 9999, ebitda: 9999 }]
    )
    expect(pool).toHaveLength(1)
    expect(pool[0].revenue).toBe(1)
  })
})

describe('mergeHistoricalAndForecastRows', () => {
  it('returns historical rows untouched when no forecasts exist', () => {
    const historical = [
      { year: 2024, revenue: 1000, ebitda: 100 },
      { year: 2023, revenue: 900, ebitda: 90 },
    ]
    const merged = mergeHistoricalAndForecastRows(historical, [])
    expect(merged).toEqual([
      { year: 2023, revenue: 900, ebitda: 90 },
      { year: 2024, revenue: 1000, ebitda: 100 },
    ])
  })

  it('preserves forecast rows alongside historical rows, sorted ascending', () => {
    const historical = [{ year: 2024, revenue: 1000, ebitda: 100 }]
    const existing = [
      { year: 2026, revenue: 1500, ebitda: 200, is_forecast: true },
      { year: 2027, revenue: 1700, ebitda: 230, is_forecast: true },
    ]
    const merged = mergeHistoricalAndForecastRows(historical, existing)
    expect(merged.map((r) => r.year)).toEqual([2024, 2026, 2027])
    expect(merged.filter((r) => 'is_forecast' in r && r.is_forecast)).toHaveLength(2)
  })

  it('drops a forecast row that conflicts with a historical year (historical wins)', () => {
    const historical = [{ year: 2024, revenue: 1000, ebitda: 100 }]
    const existing = [
      { year: 2024, revenue: 999, ebitda: 99, is_forecast: true }, // contradictory
      { year: 2026, revenue: 1500, ebitda: 200, is_forecast: true },
    ]
    const merged = mergeHistoricalAndForecastRows(historical, existing)
    expect(merged.map((r) => r.year)).toEqual([2024, 2026])
    const row2024 = merged.find((r) => r.year === 2024)
    // Historical (non-forecast) row is the one that survives.
    expect((row2024 as { is_forecast?: boolean }).is_forecast).toBeUndefined()
    expect((row2024 as { revenue: number }).revenue).toBe(1000)
  })

  it('drops historical rows with invalid years (defensive)', () => {
    const historical = [
      { year: 2024, revenue: 1000, ebitda: 100 },
      { year: Number.NaN as unknown as number, revenue: 0, ebitda: 0 },
    ]
    const existing = [{ year: 2024, revenue: 0, ebitda: 0, is_forecast: true }]
    const merged = mergeHistoricalAndForecastRows(historical, existing)
    expect(merged.map((r) => r.year)).toEqual([2024])
    expect(merged).toHaveLength(1)
  })

  it('drops forecast rows outside the supported year window', () => {
    const historical = [{ year: 2024, revenue: 1000, ebitda: 100 }]
    const existing = [
      { year: 3000, revenue: 1, ebitda: 1, is_forecast: true },
      { year: 2026, revenue: 1500, ebitda: 200, is_forecast: true },
    ]
    const merged = mergeHistoricalAndForecastRows(historical, existing)
    expect(merged.map((r) => r.year)).toEqual([2024, 2026])
  })

  it('does not mutate input arrays', () => {
    const historical = [{ year: 2024, revenue: 1000, ebitda: 100 }]
    const existing = [{ year: 2026, revenue: 1500, ebitda: 200, is_forecast: true }]
    const histSnap = [...historical]
    const existSnap = [...existing]
    mergeHistoricalAndForecastRows(historical, existing)
    expect(historical).toEqual(histSnap)
    expect(existing).toEqual(existSnap)
  })
})

describe('pickForecastRowsToPreserve', () => {
  it('returns only forecast rows', () => {
    const existing = [
      { year: 2024, revenue: 1000, ebitda: 100 },
      { year: 2026, revenue: 1500, ebitda: 200, is_forecast: true },
      { year: 2025, revenue: 1200, ebitda: 150 },
      { year: 2027, revenue: 1700, ebitda: 230, is_forecast: true },
    ]
    expect(pickForecastRowsToPreserve(existing).map((r) => r.year)).toEqual([2026, 2027])
  })

  it('returns an empty array when none are forecasts', () => {
    expect(pickForecastRowsToPreserve([{ year: 2024, revenue: 1000, ebitda: 100 }])).toEqual([])
  })

  it('returns an empty array for empty input', () => {
    expect(pickForecastRowsToPreserve([])).toEqual([])
  })

  it('drops forecasts with invalid years', () => {
    expect(
      pickForecastRowsToPreserve([
        { year: 1999, revenue: 1, ebitda: 1, is_forecast: true },
        { year: 2026, revenue: 1500, ebitda: 200, is_forecast: true },
      ]).map((r) => r.year)
    ).toEqual([2026])
  })
})

describe('areMergedYearRowsEqual', () => {
  it('treats undefined and empty as equal', () => {
    expect(areMergedYearRowsEqual(undefined, undefined)).toBe(true)
    expect(areMergedYearRowsEqual(undefined, [])).toBe(true)
    expect(areMergedYearRowsEqual([], undefined)).toBe(true)
  })

  it('ignores row order', () => {
    const a = [
      { year: 2024, revenue: 1000, ebitda: 100 },
      { year: 2023, revenue: 900, ebitda: 90 },
    ]
    const b = [
      { year: 2023, revenue: 900, ebitda: 90 },
      { year: 2024, revenue: 1000, ebitda: 100 },
    ]
    expect(areMergedYearRowsEqual(a, b)).toBe(true)
  })

  it('detects revenue drift', () => {
    expect(
      areMergedYearRowsEqual(
        [{ year: 2024, revenue: 1000, ebitda: 100 }],
        [{ year: 2024, revenue: 1001, ebitda: 100 }]
      )
    ).toBe(false)
  })

  it('detects forecast flag drift', () => {
    expect(
      areMergedYearRowsEqual(
        [{ year: 2026, revenue: 1500, ebitda: 200, is_forecast: true }],
        [{ year: 2026, revenue: 1500, ebitda: 200 }]
      )
    ).toBe(false)
  })

  it('filters junk years before comparing', () => {
    expect(
      areMergedYearRowsEqual(
        [{ year: 2024, revenue: 1000, ebitda: 100 }],
        [
          { year: 2024, revenue: 1000, ebitda: 100 },
          { year: 3000, revenue: 1, ebitda: 1, is_forecast: true },
        ]
      )
    ).toBe(true)
  })
})
