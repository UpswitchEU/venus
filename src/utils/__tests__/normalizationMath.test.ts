import { describe, expect, it } from 'vitest'
import type { NormalizationItem } from '../../components/calculator/UnifiedNormalizationModal'
import {
  getNormalizationAmountForBase,
  getReportedEbitdaBaseline,
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
    })
  })
})
