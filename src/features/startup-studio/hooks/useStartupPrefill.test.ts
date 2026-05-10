/**
 * Pure-function tests for the prefill helpers.  The full hook is
 * integration-tested via panel mounting; this suite pins the
 * defensive parsing primitives so a regression in one of them can't
 * silently let bad URL/KBO data into the store.
 */
import { describe, expect, it } from 'vitest'
import {
  parseFoundingYear,
  parseRoundSize,
  ROUND_SIZE_MAX,
  ROUND_SIZE_MIN,
} from './useStartupPrefill.helpers'

describe('parseFoundingYear', () => {
  it('extracts the year from an ISO yyyy-mm-dd', () => {
    expect(parseFoundingYear('2018-04-12')).toBe(2018)
  })

  it('accepts a bare yyyy', () => {
    expect(parseFoundingYear('2018')).toBe(2018)
  })

  it('returns null on missing or empty input', () => {
    expect(parseFoundingYear(undefined)).toBeNull()
    expect(parseFoundingYear(null)).toBeNull()
    expect(parseFoundingYear('')).toBeNull()
    expect(parseFoundingYear('   ')).toBeNull()
  })

  it('returns null when the year is outside the defensible range', () => {
    expect(parseFoundingYear('1899-01-01')).toBeNull()
    expect(parseFoundingYear('2200-01-01')).toBeNull()
  })

  it('returns null when the prefix is not a valid 4-digit year', () => {
    expect(parseFoundingYear('founded-2020')).toBeNull()
    expect(parseFoundingYear('20-01-2018')).toBeNull()
  })
})

describe('parseRoundSize', () => {
  it('returns null on missing or empty input', () => {
    expect(parseRoundSize(null)).toBeNull()
    expect(parseRoundSize(undefined)).toBeNull()
    expect(parseRoundSize('')).toBeNull()
  })

  it('returns null on non-numeric input', () => {
    expect(parseRoundSize('not-a-number')).toBeNull()
    expect(parseRoundSize('1M')).toBeNull()
  })

  it('returns null below the floor (typo / test value defence)', () => {
    expect(parseRoundSize(String(ROUND_SIZE_MIN - 1))).toBeNull()
    expect(parseRoundSize('100')).toBeNull()
  })

  it('clamps above the ceiling instead of rejecting (founder still gets the cap)', () => {
    expect(parseRoundSize(String(ROUND_SIZE_MAX + 1))).toBe(ROUND_SIZE_MAX)
    expect(parseRoundSize('999999999')).toBe(ROUND_SIZE_MAX)
  })

  it('passes through a defensible mid-range value', () => {
    expect(parseRoundSize('500000')).toBe(500_000)
    expect(parseRoundSize('1500000')).toBe(1_500_000)
  })

  it('accepts the exact min and max bounds', () => {
    expect(parseRoundSize(String(ROUND_SIZE_MIN))).toBe(ROUND_SIZE_MIN)
    expect(parseRoundSize(String(ROUND_SIZE_MAX))).toBe(ROUND_SIZE_MAX)
  })
})
