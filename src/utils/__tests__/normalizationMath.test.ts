import { describe, expect, it } from 'vitest'
import type { NormalizationItem } from '../../components/calculator/UnifiedNormalizationModal'
import {
  appliesToYear,
  countNormalizationsBoundToFiscalYear,
  getNormalizationAmountForBase,
  getReportedEbitdaBaseline,
  removeNormalizationsForRemovedFiscalYear,
  summarizeAcceptedNormalizations,
  summarizeAcceptedNormalizationsAcrossYears,
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
})
