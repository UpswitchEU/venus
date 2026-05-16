import { describe, expect, it } from 'vitest'
import {
  computeSdeOwnerSalaryPrefill,
  type SdeSalaryPrefillNormalizationItem,
} from './sdeOwnerSalaryPrefill'

const item = (
  partial: Partial<SdeSalaryPrefillNormalizationItem>
): SdeSalaryPrefillNormalizationItem => ({
  category: 'salary',
  status: 'accepted',
  value: 80_000,
  year: 2024,
  ...partial,
})

describe('computeSdeOwnerSalaryPrefill', () => {
  it('returns null suggestion when there are no items', () => {
    const out = computeSdeOwnerSalaryPrefill([])
    expect(out.suggestedValue).toBeNull()
    expect(out.sourceYear).toBeNull()
    expect(out.source).toBeNull()
  })

  it('returns null when no salary items are accepted', () => {
    const out = computeSdeOwnerSalaryPrefill([
      item({ status: 'pending' }),
      item({ status: 'rejected' }),
      item({ category: 'rent' }),
    ])
    expect(out.suggestedValue).toBeNull()
  })

  it('picks the latest year salary item value', () => {
    const out = computeSdeOwnerSalaryPrefill([
      item({ year: 2022, value: 60_000 }),
      item({ year: 2024, value: 90_000, ledgerCode: '620' }),
      item({ year: 2023, value: 75_000, ledgerCode: '618' }),
    ])
    expect(out.suggestedValue).toBe(90_000)
    expect(out.sourceYear).toBe(2024)
    expect(out.source).toBe('imported_ledger')
  })

  it('flags imported_ledger when ledgerCode is 620 / 620xxx', () => {
    expect(computeSdeOwnerSalaryPrefill([item({ ledgerCode: '620' })]).source).toBe(
      'imported_ledger'
    )
    expect(computeSdeOwnerSalaryPrefill([item({ ledgerCode: '620000' })]).source).toBe(
      'imported_ledger'
    )
  })

  it('flags imported_ledger when ledgerCode is 618 / 618xxx (Titan auto-norm)', () => {
    expect(computeSdeOwnerSalaryPrefill([item({ ledgerCode: '618' })]).source).toBe(
      'imported_ledger'
    )
    expect(computeSdeOwnerSalaryPrefill([item({ ledgerCode: '618100' })]).source).toBe(
      'imported_ledger'
    )
  })

  it('flags manual_entry when ledgerCode is missing or non-payroll', () => {
    expect(computeSdeOwnerSalaryPrefill([item({})]).source).toBe('manual_entry')
    expect(computeSdeOwnerSalaryPrefill([item({ ledgerCode: '610' })]).source).toBe('manual_entry')
  })

  it('skips zero / negative / non-finite values', () => {
    const out = computeSdeOwnerSalaryPrefill([
      item({ value: 0 }),
      item({ value: -1000 }),
      item({ value: Number.NaN }),
    ])
    expect(out.suggestedValue).toBeNull()
  })

  it('rounds the value to a whole number', () => {
    const out = computeSdeOwnerSalaryPrefill([item({ value: 87_654.92 })])
    expect(out.suggestedValue).toBe(87_655)
  })

  it('handles null / undefined input gracefully', () => {
    expect(computeSdeOwnerSalaryPrefill(null).suggestedValue).toBeNull()
    expect(computeSdeOwnerSalaryPrefill(undefined).suggestedValue).toBeNull()
  })
})
