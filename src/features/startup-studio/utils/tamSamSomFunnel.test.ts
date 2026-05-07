import { describe, expect, it } from 'vitest'
import {
  TAM_SAM_SOM_MAX_EUR,
  computeSomSharePercents,
  formatSomShareForIntl,
  mergeTamSamSomField,
  normalizeTamSamSomField,
} from './tamSamSomFunnel'

describe('computeSomSharePercents', () => {
  it('returns shares for a coherent funnel', () => {
    const r = computeSomSharePercents(1_000_000_000_000, 50_000_000_000, 750_000_000)
    expect(r).not.toBeNull()
    expect(r!.pctOfTam).toBeCloseTo(0.075, 6)
    expect(r!.pctOfSam).toBeCloseTo(1.5, 6)
    expect(r!.issues).toEqual([])
  })

  it('returns null when any value is non-positive', () => {
    expect(computeSomSharePercents(0, 1, 1)).toBeNull()
    expect(computeSomSharePercents(1, 0, 1)).toBeNull()
    expect(computeSomSharePercents(1, 1, 0)).toBeNull()
  })

  it('returns null for non-finite inputs', () => {
    expect(computeSomSharePercents(NaN, 1, 1)).toBeNull()
    expect(computeSomSharePercents(1, Number.NaN, 1)).toBeNull()
  })

  it('flags SAM > TAM', () => {
    const r = computeSomSharePercents(100, 200, 10)
    expect(r?.issues).toContain('sam_gt_tam')
  })

  it('flags SOM > SAM without implying SOM > TAM when TAM is larger', () => {
    const r = computeSomSharePercents(1_000, 500, 600)
    expect(r?.issues).toContain('som_gt_sam')
    expect(r?.issues).not.toContain('som_gt_tam')
  })

  it('flags SOM > TAM', () => {
    const r = computeSomSharePercents(100, 80, 150)
    expect(r?.issues).toContain('som_gt_tam')
    expect(r?.issues).toContain('som_gt_sam')
  })

  it('still returns percents when funnel is inconsistent', () => {
    const r = computeSomSharePercents(100, 200, 50)
    expect(r?.pctOfSam).toBeCloseTo(25, 6)
    expect(r?.pctOfTam).toBeCloseTo(50, 6)
    expect(r?.issues.length).toBeGreaterThan(0)
  })
})

describe('formatSomShareForIntl', () => {
  it('formats with two decimal places', () => {
    expect(formatSomShareForIntl(1.23456)).toBe('1.23')
  })

  it('returns em dash for non-finite', () => {
    expect(formatSomShareForIntl(Number.NaN)).toBe('—')
  })
})

describe('normalizeTamSamSomField', () => {
  it('returns null for non-positive, non-finite, or empty', () => {
    expect(normalizeTamSamSomField(null)).toBeNull()
    expect(normalizeTamSamSomField(undefined)).toBeNull()
    expect(normalizeTamSamSomField(0)).toBeNull()
    expect(normalizeTamSamSomField(-1)).toBeNull()
    expect(normalizeTamSamSomField(Number.NaN)).toBeNull()
  })

  it('rounds and caps', () => {
    expect(normalizeTamSamSomField(1.2)).toBe(1)
    expect(normalizeTamSamSomField(TAM_SAM_SOM_MAX_EUR + 99)).toBe(TAM_SAM_SOM_MAX_EUR)
  })
})

describe('mergeTamSamSomField', () => {
  it('clears on explicit null', () => {
    expect(mergeTamSamSomField(null, 5)).toBeNull()
  })

  it('normalizes valid numbers', () => {
    expect(mergeTamSamSomField(1_000_000, null)).toBe(1_000_000)
  })

  it('falls back to normalized previous on garbage', () => {
    expect(mergeTamSamSomField('nope', 1_000)).toBe(1_000)
    expect(mergeTamSamSomField(Number.NaN, 2_000)).toBe(2_000)
  })
})
