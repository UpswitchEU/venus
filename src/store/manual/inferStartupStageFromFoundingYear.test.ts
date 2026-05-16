/**
 * Unit tests for the registry-driven stage inference.
 *
 * The store action ``seedStageFromFoundingYearIfDefault`` is just a
 * thin wrapper around this pure function — pinning the cohort
 * boundaries here keeps the engine-facing behaviour stable.
 */

import { describe, expect, it } from 'vitest'
import {
  inferStartupStageFromFoundingYear,
  STAGE_PRE_SEED_MAX_AGE_YEARS,
  STAGE_SEED_MAX_AGE_YEARS,
} from './inferStartupStageFromFoundingYear'

describe('inferStartupStageFromFoundingYear', () => {
  it('returns null when founding year is missing', () => {
    expect(inferStartupStageFromFoundingYear({ foundingYear: null })).toBeNull()
    expect(inferStartupStageFromFoundingYear({ foundingYear: undefined })).toBeNull()
  })

  it('returns null on garbage input', () => {
    expect(inferStartupStageFromFoundingYear({ foundingYear: Number.NaN })).toBeNull()
    expect(inferStartupStageFromFoundingYear({ foundingYear: 0 })).toBeNull()
    expect(inferStartupStageFromFoundingYear({ foundingYear: 1899 })).toBeNull()
    expect(inferStartupStageFromFoundingYear({ foundingYear: 2101 })).toBeNull()
  })

  it('treats current-year and last-year incorporations as pre-seed', () => {
    expect(
      inferStartupStageFromFoundingYear({
        foundingYear: 2026,
        todayYear: 2026,
      })
    ).toBe('pre_seed')
    expect(
      inferStartupStageFromFoundingYear({
        foundingYear: 2025,
        todayYear: 2026,
      })
    ).toBe('pre_seed')
  })

  it('treats 2-3 year-old companies as seed', () => {
    expect(
      inferStartupStageFromFoundingYear({
        foundingYear: 2024,
        todayYear: 2026,
      })
    ).toBe('seed')
    expect(
      inferStartupStageFromFoundingYear({
        foundingYear: 2023,
        todayYear: 2026,
      })
    ).toBe('seed')
  })

  it('treats 4-year-old or older companies as series A', () => {
    expect(
      inferStartupStageFromFoundingYear({
        foundingYear: 2022,
        todayYear: 2026,
      })
    ).toBe('series_a')
    expect(
      inferStartupStageFromFoundingYear({
        foundingYear: 2018,
        todayYear: 2026,
      })
    ).toBe('series_a')
  })

  it('treats future-dated registrations as pre-seed (registry indexing race)', () => {
    expect(
      inferStartupStageFromFoundingYear({
        foundingYear: 2027,
        todayYear: 2026,
      })
    ).toBe('pre_seed')
  })

  it('exposes cohort boundary constants for downstream pinning', () => {
    expect(STAGE_PRE_SEED_MAX_AGE_YEARS).toBe(1)
    expect(STAGE_SEED_MAX_AGE_YEARS).toBe(3)
  })
})
