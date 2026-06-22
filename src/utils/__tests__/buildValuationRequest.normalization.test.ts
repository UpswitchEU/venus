import { afterEach, describe, expect, it, vi } from 'vitest'
import { NormalizationCategory } from '../../types/ebitdaNormalization'
import { buildValuationRequest } from '../buildValuationRequest'
import { getCurrentFilingYear } from '../fiscalYear'
import { makeFormData } from './buildValuationRequest.testUtils'

describe('buildValuationRequest normalization integrity guards', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  // ─── Normalization integrity guard ─────────────────────────────────────────
  // Regression for the Metaalbewerking incident: visible normalizations in the
  // store with status !== 'accepted' would silently drop from the request, the
  // valuation would run on unnormalized EBITDA, and the seller would be
  // undervalued by ~€1M. The guard logs a warning so QA/telemetry catches it.
  it('logs an integrity warning when items are visible but none reach the request', async () => {
    const loggerModule = await import('../logger')
    const warnSpy = vi.spyOn(loggerModule.generalLogger, 'warn')

    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        ebitda: 290_000,
        current_year_data: {
          year: lastFullYear,
          revenue: 1_950_000,
          ebitda: 290_000,
        },
      }),
      [
        // Pending — would be displayed as a normalization but is NOT applied.
        {
          id: 'norm-pending-1',
          title: 'Owner compensation',
          rationale: 'Above-market owner salary',
          category: 'salary',
          type: 'add',
          value: 280_000,
          adjustment: 280_000,
          year: lastFullYear,
          status: 'pending',
          source: 'manual',
          confidence: 'high',
          createdAt: new Date().toISOString(),
        },
      ]
    )

    expect(result.current_year_data.ebitda).toBe(290_000)
    expect(result.current_year_data.ebitda_normalization_metadata).toBeUndefined()

    const matched = warnSpy.mock.calls.find(
      ([msg]) => typeof msg === 'string' && msg.includes('Normalization integrity guard')
    )
    expect(matched).toBeDefined()
    const ctx = matched?.[1] as Record<string, unknown> | undefined
    expect(ctx?.visible_count).toBe(1)
    expect(ctx?.visible_total_adjustment).toBe(280_000)

    warnSpy.mockRestore()
  })

  it('does not warn when at least one item is accepted', async () => {
    const loggerModule = await import('../logger')
    const warnSpy = vi.spyOn(loggerModule.generalLogger, 'warn')

    const lastFullYear = getCurrentFilingYear()
    buildValuationRequest(
      makeFormData({
        ebitda: 290_000,
        current_year_data: {
          year: lastFullYear,
          revenue: 1_950_000,
          ebitda: 290_000,
        },
      }),
      [
        {
          id: 'norm-accepted-1',
          title: 'Owner compensation',
          rationale: 'Above-market owner salary',
          category: 'salary',
          type: 'add',
          value: 280_000,
          adjustment: 280_000,
          year: lastFullYear,
          status: 'accepted',
          source: 'manual',
          confidence: 'high',
          createdAt: new Date().toISOString(),
        },
      ]
    )

    const matched = warnSpy.mock.calls.find(
      ([msg]) => typeof msg === 'string' && msg.includes('Normalization integrity guard')
    )
    expect(matched).toBeUndefined()

    warnSpy.mockRestore()
  })

  it('rechecks legacy accepted imported addbacks before applying them to EBITDA', async () => {
    const loggerModule = await import('../logger')
    const warnSpy = vi.spyOn(loggerModule.generalLogger, 'warn')

    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        ebitda: 260_000,
        current_year_data: {
          year: lastFullYear,
          revenue: 1_800_000,
          ebitda: 260_000,
        },
      }),
      [
        {
          id: `imported_sde_${lastFullYear}_610000_0`,
          ledgerCode: '610000',
          ledgerName: 'Services and other goods',
          category: 'other',
          type: 'add',
          value: 206_000,
          adjustment: 206_000,
          year: lastFullYear,
          applyAllYears: false,
          applyYears: [lastFullYear],
          status: 'accepted',
          source: 'auto',
          confidence: 'high',
        },
      ]
    )

    expect(result.current_year_data.ebitda).toBe(260_000)
    expect(result.current_year_data.ebitda_normalization_metadata).toBeUndefined()

    const matched = warnSpy.mock.calls.find(
      ([msg]) => typeof msg === 'string' && msg.includes('Normalization integrity guard')
    )
    expect(matched).toBeDefined()

    warnSpy.mockRestore()
  })

  it('applies an imported addback once the advisor explicitly reviewed it', () => {
    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        ebitda: 260_000,
        current_year_data: {
          year: lastFullYear,
          revenue: 1_800_000,
          ebitda: 260_000,
        },
      }),
      [
        {
          id: `imported_sde_${lastFullYear}_610000_0`,
          ledgerCode: '610000',
          ledgerName: 'Services and other goods',
          category: 'other',
          type: 'add',
          value: 206_000,
          adjustment: 206_000,
          year: lastFullYear,
          applyAllYears: false,
          applyYears: [lastFullYear],
          status: 'accepted',
          reviewedAt: '2026-06-01T10:00:00.000Z',
          source: 'auto',
          confidence: 'high',
        },
      ]
    )

    expect(result.current_year_data.ebitda).toBe(466_000)
    expect(result.current_year_data.ebitda_normalization_metadata).toMatchObject({
      reported_ebitda: 260_000,
      normalized_ebitda: 466_000,
      total_adjustments: 206_000,
    })
  })

  it('uses the latest imported actual year instead of a stale zero filing-year placeholder', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))

    const result = buildValuationRequest(
      makeFormData({
        revenue: 0,
        ebitda: 0,
        current_year_data: {
          year: 2025,
          revenue: 0,
          ebitda: 0,
        },
        historical_years_data: [
          { year: 2021, revenue: 1_350_000, ebitda: 180_000 },
          { year: 2022, revenue: 1_500_000, ebitda: 205_000 },
          { year: 2023, revenue: 1_650_000, ebitda: 230_000 },
          { year: 2024, revenue: 1_800_000, ebitda: 260_000 },
        ],
      }),
      []
    )

    expect(result.current_year_data).toMatchObject({
      year: 2024,
      revenue: 1_800_000,
      ebitda: 260_000,
    })
    expect(result.historical_years_data.map((row) => row.year)).toEqual([2021, 2022, 2023])
  })

  it('applies a reviewed imported addback to the promoted actual year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))

    const result = buildValuationRequest(
      makeFormData({
        revenue: 0,
        ebitda: 0,
        current_year_data: {
          year: 2025,
          revenue: 0,
          ebitda: 0,
        },
        historical_years_data: [
          { year: 2021, revenue: 1_350_000, ebitda: 180_000 },
          { year: 2022, revenue: 1_500_000, ebitda: 205_000 },
          { year: 2023, revenue: 1_650_000, ebitda: 230_000 },
          { year: 2024, revenue: 1_800_000, ebitda: 260_000 },
        ],
      }),
      [
        {
          id: 'imported_sde_2024_610000_0',
          ledgerCode: '610000',
          ledgerName: 'Services and other goods',
          category: 'other',
          type: 'add',
          value: 206_000,
          adjustment: 206_000,
          year: 2024,
          applyAllYears: false,
          applyYears: [2024],
          status: 'accepted',
          reviewedAt: '2026-06-01T10:00:00.000Z',
          source: 'auto',
          confidence: 'high',
        },
      ]
    )

    expect(result.current_year_data).toMatchObject({
      year: 2024,
      revenue: 1_800_000,
      ebitda: 466_000,
      ebitda_normalized: true,
    })
    expect(result.current_year_data.ebitda_normalization_metadata).toMatchObject({
      reported_ebitda: 260_000,
      normalized_ebitda: 466_000,
      total_adjustments: 206_000,
    })
    expect(result.historical_years_data.map((row) => row.year)).toEqual([2021, 2022, 2023])
  })

  // ─── Orphan-year normalization guard (legacy store path) ─────────────────
  // ValuationForm still writes to useEbitdaNormalizationStore. A legacy
  // entry keyed by a year outside the canonical data set used to be
  // allocated into normByYear[<missing year>] and silently lost when the
  // current/historical builders ran. The guard now drops + logs them too.
  it('logs and drops legacy-store normalizations keyed by an orphan year', async () => {
    const loggerModule = await import('../logger')
    const ebitdaStoreModule = await import('../../store/useEbitdaNormalizationStore')
    const warnSpy = vi.spyOn(loggerModule.generalLogger, 'warn')

    // Inject a legacy entry directly — bypassing the openModal flow because
    // we just want to test the request builder's read-side handling.
    ebitdaStoreModule.useEbitdaNormalizationStore.setState({
      normalizations: {
        1999: {
          session_id: 'test',
          year: 1999,
          reported_ebitda: 0,
          adjustments: [
            {
              category: NormalizationCategory.OWNER_COMPENSATION,
              amount: 280_000,
              note: 'orphan legacy',
            },
          ],
          custom_adjustments: [],
          total_adjustments: 280_000,
          normalized_ebitda: 280_000,
          confidence_score: 'medium',
          updated_at: new Date().toISOString(),
        },
      },
    })

    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        ebitda: 290_000,
        current_year_data: {
          year: lastFullYear,
          revenue: 1_950_000,
          ebitda: 290_000,
        },
      }),
      []
    )

    // Current-year EBITDA must NOT have absorbed the orphan legacy addback.
    expect(result.current_year_data.ebitda).toBe(290_000)
    expect(result.current_year_data.ebitda_normalization_metadata).toBeUndefined()

    const matched = warnSpy.mock.calls.find(
      ([msg]) =>
        typeof msg === 'string' &&
        msg.includes('Dropped legacy normalization entries with no matching year')
    )
    expect(matched).toBeDefined()
    const ctx = matched?.[1] as Record<string, unknown> | undefined
    expect(ctx?.orphan_count).toBe(1)
    expect(ctx?.orphan_total_adjustment).toBe(280_000)

    // Cleanup so other tests don't see this fixture.
    ebitdaStoreModule.useEbitdaNormalizationStore.setState({
      normalizations: {},
    })
    warnSpy.mockRestore()
  })

  // ─── Orphan-year normalization guard ──────────────────────────────────────
  // Second flavor of the Metaalbewerking-class silent drop: an accepted
  // normalization targets a year that doesn't exist in current_year_data
  // OR historical_years_data. Without this guard the addback would be allocated
  // into normByYear[<missing year>] but never read by either request builder
  // — €280K would simply vanish from the calculation.
  it('logs and drops accepted normalizations whose target year is outside the data set', async () => {
    const loggerModule = await import('../logger')
    const warnSpy = vi.spyOn(loggerModule.generalLogger, 'warn')

    const lastFullYear = getCurrentFilingYear()
    const orphanYear = 1999 // intentionally outside the data set
    const result = buildValuationRequest(
      makeFormData({
        ebitda: 290_000,
        current_year_data: {
          year: lastFullYear,
          revenue: 1_950_000,
          ebitda: 290_000,
        },
      }),
      [
        {
          id: 'norm-orphan',
          title: 'Stale orphan addback',
          rationale: 'Targets a year that no longer exists',
          category: 'other',
          type: 'add',
          value: 280_000,
          adjustment: 280_000,
          year: orphanYear,
          applyAllYears: false,
          applyYears: [orphanYear],
          status: 'accepted',
          source: 'manual',
          confidence: 'medium',
          createdAt: new Date().toISOString(),
        },
      ]
    )

    // Current-year EBITDA must NOT have absorbed the orphan addback.
    expect(result.current_year_data.ebitda).toBe(290_000)
    expect(result.current_year_data.ebitda_normalization_metadata).toBeUndefined()

    const matched = warnSpy.mock.calls.find(
      ([msg]) =>
        typeof msg === 'string' &&
        msg.includes('Dropped accepted normalizations with no matching year')
    )
    expect(matched).toBeDefined()
    const ctx = matched?.[1] as Record<string, unknown> | undefined
    expect(ctx?.orphan_count).toBe(1)
    expect(ctx?.orphan_total_adjustment).toBe(280_000)
    expect(Array.isArray(ctx?.canonical_years)).toBe(true)

    warnSpy.mockRestore()
  })

  // -------------------------------------------------------------------
  // Capital history → cap_table + investment_amount_sought bridge
  //
  // Pins the Mercury → Titan boundary contract for the SaaS cap-table
  // feature.  The form-store carries `capital_*` fields (UI-only); the
  // builder must collapse them into the canonical `cap_table` summary
  // and the top-level `investment_amount_sought` field that Titan's
  // Zod schema validates and ValuationIQ's `calculate_arr_method`
  // consumes.  Empty / disabled inputs ⇒ neither field on the wire
  // (backwards compat).
  // -------------------------------------------------------------------
})
