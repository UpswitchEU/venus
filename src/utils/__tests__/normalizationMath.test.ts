import { describe, expect, it } from 'vitest'
import type { NormalizationItem } from '../../components/calculator/UnifiedNormalizationModal'
import {
  appliesToYear,
  countNormalizationsBoundToFiscalYear,
  findAcceptedAutoNormalizationCapBreaches,
  getNormalizationAmountForBase,
  getReportedEbitdaBaseline,
  normalizationItemTouchesYear,
  removeNormalizationsForRemovedFiscalYear,
  summarizeAcceptedNormalizations,
  summarizeAcceptedNormalizationsAcrossYears,
  summarizeNormalizationsForAnchorYear,
} from '../normalizationMath'

describe('normalizationMath', () => {
  it('keeps the Bakker Bas reported EBITDA baseline at 100k', () => {
    const original = getReportedEbitdaBaseline({
      year: 2025,
      originalEBITDAByYear: { 2025: 100_000 },
      fallbackCandidates: [99_000, 98_000],
    })

    expect(original).toBe(100_000)
  })

  it('summarizes the Bakker Bas adjustment as 100k -> -1k -> 99k', () => {
    const items: NormalizationItem[] = [
      {
        id: 'bakker-bas-owner-pay',
        ledgerCode: '620',
        ledgerName: 'Bezoldigingen bestuurders en zaakvoerders',
        category: 'salary',
        type: 'subtract',
        value: -1_000,
        adjustment: -1_000,
        reason: 'Correctie naar marktconform niveau',
        source: 'manual',
        status: 'accepted',
        applyAllYears: false,
        year: 2025,
      },
    ]

    expect(summarizeAcceptedNormalizations(items, 100_000)).toEqual({
      original: 100_000,
      adjustment: -1_000,
      normalized: 99_000,
      pendingAdjustment: 0,
      pendingCount: 0,
    })
  })

  it('recalculates percentage and absolute items from the reported EBITDA baseline', () => {
    expect(
      getNormalizationAmountForBase(
        {
          type: 'subtract_percent',
          value: 5,
          adjustment: -999,
        },
        100_000
      )
    ).toBe(-5_000)

    expect(
      getNormalizationAmountForBase(
        {
          type: 'absolute',
          value: 99_000,
          adjustment: -1_000,
        },
        100_000
      )
    ).toBe(-1_000)
  })

  it('appliesToYear: single source of truth for year applicability', () => {
    const accepted = {
      id: 'x',
      ledgerCode: '',
      ledgerName: '',
      category: 'salary' as const,
      type: 'add' as const,
      value: 1000,
      adjustment: 1000,
      reason: '',
      source: 'manual' as const,
      status: 'accepted' as const,
      year: 2025,
    }
    const pending = { ...accepted, status: 'pending' as const }
    expect(appliesToYear(accepted, 2025)).toBe(true)
    expect(appliesToYear(accepted, 2024)).toBe(false)
    expect(appliesToYear(pending, 2025)).toBe(false)
    expect(appliesToYear({ ...accepted, applyAllYears: true }, 2024)).toBe(true)
    expect(appliesToYear({ ...accepted, applyYears: [2023, 2024] }, 2024)).toBe(true)
    expect(appliesToYear({ ...accepted, applyYears: [2023, 2024] }, 2025)).toBe(false)
  })

  it('normalizationItemTouchesYear: anchors modal grouping for any status', () => {
    const row = {
      id: 'x',
      ledgerCode: '',
      ledgerName: '',
      category: 'salary' as const,
      type: 'add' as const,
      value: 50_000,
      adjustment: 50_000,
      reason: '',
      source: 'manual' as const,
      status: 'pending' as const,
      year: 2025,
      applyAllYears: false,
    }
    expect(normalizationItemTouchesYear(row, 2025)).toBe(true)
    expect(normalizationItemTouchesYear(row, 2024)).toBe(false)
    expect(normalizationItemTouchesYear({ ...row, status: 'accepted' }, 2025)).toBe(true)
    expect(normalizationItemTouchesYear({ ...row, applyYears: [2024, 2025] }, 2024)).toBe(true)
    expect(normalizationItemTouchesYear({ ...row, applyAllYears: true, year: 2020 }, 2027)).toBe(
      true
    )
  })

  it('summarizeNormalizationsForAnchorYear filters to anchor only (no summing other years)', () => {
    const base = {
      ledgerCode: '',
      ledgerName: '',
      category: 'other' as const,
      source: 'manual' as const,
      status: 'accepted' as const,
      type: 'add' as const,
    }
    const items: NormalizationItem[] = [
      { ...base, id: 'a', year: 2025, value: 100_000, adjustment: 100_000, applyAllYears: false },
      { ...base, id: 'b', year: 2024, value: 20_000, adjustment: 20_000, applyAllYears: false },
    ]
    const out = summarizeNormalizationsForAnchorYear(items, 2025, 290_000)
    expect(out.adjustment).toBe(100_000)
    expect(out.normalized).toBe(390_000)
  })

  it('summarizes accepted multi-year percentage items using each year baseline', () => {
    const items: NormalizationItem[] = [
      {
        id: 'cross-year-owner-pay',
        ledgerCode: '620',
        ledgerName: 'Owner compensation',
        category: 'salary',
        type: 'subtract_percent',
        value: 10,
        adjustment: -999,
        reason: 'Market normalization',
        source: 'manual',
        status: 'accepted',
        applyAllYears: false,
        applyYears: [2024, 2025],
        year: 2025,
      },
    ]

    expect(
      summarizeAcceptedNormalizationsAcrossYears({
        items,
        availableYears: [2024, 2025],
        reportedEbitdaByYear: { 2024: 50_000, 2025: 100_000 },
        fallbackYear: 2025,
      })
    ).toEqual({
      original: 150_000,
      adjustment: -15_000,
      normalized: 135_000,
      pendingAdjustment: 0,
      pendingCount: 0,
    })
  })

  it('removeNormalizationsForRemovedFiscalYear drops single-year items and trims applyYears', () => {
    const base = {
      id: 'a',
      ledgerCode: '',
      ledgerName: '',
      category: 'salary' as const,
      type: 'add' as const,
      value: 0,
      adjustment: 0,
      reason: '',
      source: 'manual' as const,
      status: 'accepted' as const,
    }
    const items: NormalizationItem[] = [
      { ...base, id: '1', year: 2023 },
      { ...base, id: '2', applyYears: [2023, 2024], year: 2024 },
      { ...base, id: '3', applyAllYears: true, year: 2023 },
    ]
    const next = removeNormalizationsForRemovedFiscalYear(items, 2023)
    expect(next.find((x) => x.id === '1')).toBeUndefined()
    expect(next.find((x) => x.id === '2')?.applyYears).toEqual([2024])
    expect(next.find((x) => x.id === '3')).toBeDefined()
  })

  it('countNormalizationsBoundToFiscalYear excludes applyAllYears', () => {
    const base = {
      id: 'a',
      ledgerCode: '',
      ledgerName: '',
      category: 'salary' as const,
      type: 'add' as const,
      value: 0,
      adjustment: 0,
      reason: '',
      source: 'manual' as const,
      status: 'accepted' as const,
    }
    const items: NormalizationItem[] = [
      { ...base, id: '1', year: 2023 },
      { ...base, id: '2', applyAllYears: true, year: 2023 },
    ]
    expect(countNormalizationsBoundToFiscalYear(items, 2023)).toBe(1)
  })

  it('flags accepted auto addbacks above 50% EBITDA cap', () => {
    const base = {
      id: 'imported_sde_2025_610000_0',
      ledgerCode: '610000',
      ledgerName: 'Services and other goods',
      category: 'other' as const,
      type: 'add' as const,
      reason: 'Auto-suggested',
      source: 'auto' as const,
      status: 'accepted' as const,
      applyAllYears: false,
    }
    const items: NormalizationItem[] = [
      { ...base, year: 2025, value: 280_000, adjustment: 280_000 },
      { ...base, id: 'imported_sde_2023_610000_0', year: 2023, value: 90_000, adjustment: 90_000 },
    ]

    const out = findAcceptedAutoNormalizationCapBreaches({
      items,
      availableYears: [2025, 2024, 2023],
      reportedEbitdaByYear: { 2025: 290_000, 2023: 230_000 },
      fallbackYear: 2025,
    })

    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      year: 2025,
      reportedEbitda: 290_000,
      autoAddback: 280_000,
      capAmount: 145_000,
    })
    expect(out[0].addbackPctOfEbitda).toBeCloseTo((280_000 / 290_000) * 100, 4)
  })

  it('flags accepted accounting-import addbacks above 50% EBITDA cap', () => {
    const items: NormalizationItem[] = [
      {
        id: 'yuki-row-610000',
        ledgerCode: '610000',
        ledgerName: 'Services and other goods',
        category: 'other',
        type: 'add',
        value: 206_000,
        adjustment: 206_000,
        reason: 'Yuki imported suggestion',
        source: 'yuki',
        status: 'accepted',
        applyAllYears: false,
        year: 2024,
      },
    ]

    const out = findAcceptedAutoNormalizationCapBreaches({
      items,
      availableYears: [2024],
      reportedEbitdaByYear: { 2024: 260_000 },
      fallbackYear: 2024,
    })

    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      year: 2024,
      autoAddback: 206_000,
      capAmount: 130_000,
    })
  })

  it('ignores pending/manual items and non-positive EBITDA years for cap detection', () => {
    const items: NormalizationItem[] = [
      {
        id: 'manual_row',
        ledgerCode: '620000',
        ledgerName: 'Directors and managers',
        category: 'salary',
        type: 'add',
        value: 160_000,
        adjustment: 160_000,
        reason: 'Manual',
        source: 'manual',
        status: 'accepted',
        applyAllYears: false,
        year: 2025,
      },
      {
        id: 'imported_sde_pending',
        ledgerCode: '610000',
        ledgerName: 'Services',
        category: 'other',
        type: 'add',
        value: 200_000,
        adjustment: 200_000,
        reason: 'Pending auto',
        source: 'auto',
        status: 'pending',
        applyAllYears: false,
        year: 2024,
      },
      {
        id: 'imported_sde_negative_ebitda',
        ledgerCode: '610000',
        ledgerName: 'Services',
        category: 'other',
        type: 'add',
        value: 200_000,
        adjustment: 200_000,
        reason: 'Auto',
        source: 'auto',
        status: 'accepted',
        applyAllYears: false,
        year: 2023,
      },
    ]

    const out = findAcceptedAutoNormalizationCapBreaches({
      items,
      availableYears: [2025, 2024, 2023],
      reportedEbitdaByYear: { 2025: 300_000, 2024: 250_000, 2023: -50_000 },
      fallbackYear: 2025,
    })

    expect(out).toEqual([])
  })
})
