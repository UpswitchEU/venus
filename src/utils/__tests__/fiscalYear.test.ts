import {
  getCurrentFilingYear,
  getLastFullFiscalYear,
  normalizeCurrentYearForFiling,
} from '../fiscalYear'

describe('getCurrentFilingYear', () => {
  it.each([
    ['January', new Date('2026-01-15'), 2024],
    ['February', new Date('2026-02-10'), 2024],
    ['March', new Date('2026-03-26'), 2024],
    ['April', new Date('2026-04-01'), 2024],
    ['May', new Date('2026-05-31'), 2024],
    ['June', new Date('2026-06-30'), 2024],
  ])('returns year - 2 in %s (H1)', (_month, date, expected) => {
    expect(getCurrentFilingYear(date)).toBe(expected)
  })

  it.each([
    ['July', new Date('2026-07-01'), 2025],
    ['August', new Date('2026-08-15'), 2025],
    ['September', new Date('2026-09-30'), 2025],
    ['October', new Date('2026-10-15'), 2025],
    ['November', new Date('2026-11-01'), 2025],
    ['December', new Date('2026-12-31'), 2025],
  ])('returns year - 1 in %s (H2)', (_month, date, expected) => {
    expect(getCurrentFilingYear(date)).toBe(expected)
  })

  it('defaults to current system date when called without arguments', () => {
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()
    const expected = month <= 6 ? year - 2 : year - 1
    expect(getCurrentFilingYear()).toBe(expected)
  })
})

describe('getLastFullFiscalYear (deprecated)', () => {
  it('returns currentYear - 1 regardless of month', () => {
    const expected = new Date().getFullYear() - 1
    expect(getLastFullFiscalYear()).toBe(expected)
  })
})

describe('normalizeCurrentYearForFiling', () => {
  it('clamps unconfirmed years to the filing year in H1', () => {
    expect(normalizeCurrentYearForFiling(2025, false, new Date('2026-03-27'))).toBe(2024)
  })

  it('preserves confirmed years up to the last calendar year', () => {
    expect(normalizeCurrentYearForFiling(2025, true, new Date('2026-03-27'))).toBe(2025)
  })
})
