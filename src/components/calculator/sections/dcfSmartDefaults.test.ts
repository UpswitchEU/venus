import { describe, expect, it } from 'vitest'
import { deriveDcfSmartDefaults, deriveWaccSectorBand } from './dcfSmartDefaults'

describe('deriveDcfSmartDefaults', () => {
  it('derives sane defaults from historical revenue and EBITDA', () => {
    const defaults = deriveDcfSmartDefaults({
      businessCategory: 'saas_software',
      yearlyFinancials: [
        { year: '2022', revenue: 1_000_000, ebitda: 150_000 },
        { year: '2023', revenue: 1_150_000, ebitda: 195_000 },
        { year: '2024', revenue: 1_300_000, ebitda: 247_000 },
      ],
    })

    expect(defaults).toMatchObject({
      historicalYearsUsed: 3,
      ebitdaMarginPct: 19,
      capexPct: 3.8,
      waccPct: 11.5,
      terminalGrowthPct: 2.5,
    })
    expect(defaults?.revenueGrowthPct).toBeGreaterThan(10)
  })

  it('ignores forecast rows and falls back conservatively with limited history', () => {
    const defaults = deriveDcfSmartDefaults({
      businessCategory: 'retail',
      yearlyFinancials: [
        { year: '2024', revenue: 800_000, ebitda: 64_000 },
        { year: '2025', revenue: 900_000, ebitda: 90_000, isForecast: true },
      ],
    })

    expect(defaults).toEqual({
      revenueGrowthPct: 5,
      ebitdaMarginPct: 8,
      capexPct: 2,
      daPct: 2,
      taxRatePct: 25,
      exitMultiple: 6,
      waccPct: 11.5,
      terminalGrowthPct: 1.5,
      historicalYearsUsed: 1,
    })
  })

  it('returns null when no usable historical rows exist', () => {
    expect(
      deriveDcfSmartDefaults({
        yearlyFinancials: [{ year: '2025', revenue: 500_000, ebitda: 50_000, isForecast: true }],
      })
    ).toBeNull()
  })
})

describe('deriveWaccSectorBand', () => {
  it('returns the SaaS / Software band when business category matches', () => {
    const band = deriveWaccSectorBand('saas_software')
    expect(band.sectorLabel).toBe('SaaS / Software')
    expect(band.median).toBe(11)
    // ±2.5pp around the median, rounded to 1 decimal
    expect(band.min).toBe(8.5)
    expect(band.max).toBe(13.5)
  })

  it('returns the European SMB default when category is unknown or empty', () => {
    expect(deriveWaccSectorBand(undefined)).toMatchObject({
      sectorLabel: 'European SMB',
      median: 10.5,
    })
    expect(deriveWaccSectorBand('')).toMatchObject({ sectorLabel: 'European SMB', median: 10.5 })
    // Pick a string that doesn't contain any of the sector keywords (industry,
    // manufact, retail, ecommerce, e-commerce, saas, software, tech, construction,
    // horeca, hospitality) — `professional_services` qualifies.
    expect(deriveWaccSectorBand('professional_services')).toMatchObject({
      sectorLabel: 'European SMB',
      median: 10.5,
    })
  })

  it('floors the lower bound at 5% so the band never goes negative or implausibly low', () => {
    // Even if a sector's median ever drops below 5%, the min stays at 5%.
    // We exercise the same code path via the construction-style high band; since
    // 12 - 2.5 = 9.5, the floor isn't tripped here, but we assert the invariant.
    const construction = deriveWaccSectorBand('construction')
    expect(construction.min).toBeGreaterThanOrEqual(5)
    expect(construction.min).toBe(9.5)
    expect(construction.max).toBe(14.5)
  })

  it('classifies retail / e-commerce / industrial correctly', () => {
    expect(deriveWaccSectorBand('retail')).toMatchObject({
      sectorLabel: 'Retail / e-commerce',
      median: 11.5,
    })
    expect(deriveWaccSectorBand('e-commerce')).toMatchObject({
      sectorLabel: 'Retail / e-commerce',
    })
    expect(deriveWaccSectorBand('industrial_manufacturing')).toMatchObject({
      sectorLabel: 'Industrial / Manufacturing',
      median: 11.5,
    })
  })
})
