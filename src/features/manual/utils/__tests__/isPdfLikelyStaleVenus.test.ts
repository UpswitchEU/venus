import { describe, expect, it } from 'vitest'
import type { ValuationReportData } from '../../../../components/calculator'
import { isPdfLikelyStaleVenus } from '../isPdfLikelyStaleVenus'

const base = (): ValuationReportData =>
  ({
    reportUpdatedAt: new Date('2025-01-15T12:00:00Z'),
  }) as ValuationReportData

describe('isPdfLikelyStaleVenus', () => {
  it('returns false when there is no reportUpdatedAt', () => {
    expect(
      isPdfLikelyStaleVenus({ ...base(), reportUpdatedAt: undefined } as ValuationReportData)
    ).toBe(false)
  })

  it('returns false when pdfUrl is set but pdfGeneratedAt is missing (API inconsistency)', () => {
    const r = {
      ...base(),
      pdfUrl: 'https://example.com/report.pdf',
      pdfGeneratedAt: undefined,
    } as ValuationReportData
    expect(isPdfLikelyStaleVenus(r)).toBe(false)
  })

  it('returns true when report was updated but pdfGeneratedAt is missing and there is no pdfUrl', () => {
    const r = {
      ...base(),
      pdfUrl: undefined,
      pdfGeneratedAt: undefined,
    } as ValuationReportData
    expect(isPdfLikelyStaleVenus(r)).toBe(true)
  })

  it('returns true when pdf is older than report update', () => {
    const r = {
      ...base(),
      pdfGeneratedAt: new Date('2025-01-10T12:00:00Z'),
    } as ValuationReportData
    expect(isPdfLikelyStaleVenus(r)).toBe(true)
  })

  it('returns false when pdf is same time or newer than report update', () => {
    const t = new Date('2025-01-15T12:00:00Z')
    const r = {
      ...base(),
      reportUpdatedAt: t,
      pdfGeneratedAt: t,
    } as ValuationReportData
    expect(isPdfLikelyStaleVenus(r)).toBe(false)
  })
})
