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

  describe('pdfCoherent (authoritative)', () => {
    it('returns false when pdfCoherent is true even if timestamps + fingerprints say stale', () => {
      // The exact perpetual-regen trap: a report carrying academic-validation
      // issues whose reconciled `render_fingerprint` diverges from the raw
      // `pdf_render_fingerprint`, AND whose updated_at is newer than the PDF.
      // Titan's raw-vs-raw coherence is authoritative → fresh, no regen loop.
      const r = {
        ...base(),
        reportUpdatedAt: new Date('2025-01-15T12:00:00Z'),
        pdfGeneratedAt: new Date('2025-01-10T12:00:00Z'),
        renderFingerprint: 'fp-hoisted-A',
        pdfRenderFingerprint: 'fp-raw-A',
        pdfCoherent: true,
      } as ValuationReportData
      expect(isPdfLikelyStaleVenus(r)).toBe(false)
    })

    it('does NOT treat pdfCoherent false as definitive — falls through to heuristics (e.g. no PDF yet ⇒ stale)', () => {
      const r = {
        ...base(),
        pdfUrl: undefined,
        pdfGeneratedAt: undefined,
        pdfCoherent: false,
      } as ValuationReportData
      expect(isPdfLikelyStaleVenus(r)).toBe(true)
    })

    it('pdfCoherent false still defers to matching fingerprints (fresh)', () => {
      const r = {
        ...base(),
        reportUpdatedAt: new Date('2025-01-15T12:00:00Z'),
        pdfGeneratedAt: new Date('2025-01-10T12:00:00Z'),
        renderFingerprint: 'fp-economics-A',
        pdfRenderFingerprint: 'fp-economics-A',
        pdfCoherent: false,
      } as ValuationReportData
      expect(isPdfLikelyStaleVenus(r)).toBe(false)
    })
  })

  describe('fingerprint-first', () => {
    it('returns false when fingerprints match even if updated_at is newer than pdf_generated_at', () => {
      // The no-op-open loop: read-path HTML self-heal bumped updated_at, so the
      // timestamp heuristic would (wrongly) say stale — but the economics (and
      // therefore the PDF) are unchanged, so the fingerprints match → fresh.
      const r = {
        ...base(),
        reportUpdatedAt: new Date('2025-01-15T12:00:00Z'),
        pdfGeneratedAt: new Date('2025-01-10T12:00:00Z'),
        renderFingerprint: 'fp-economics-A',
        pdfRenderFingerprint: 'fp-economics-A',
      } as ValuationReportData
      expect(isPdfLikelyStaleVenus(r)).toBe(false)
    })

    it('returns true when fingerprints differ even if pdf_generated_at is newer than updated_at', () => {
      const r = {
        ...base(),
        reportUpdatedAt: new Date('2025-01-10T12:00:00Z'),
        pdfGeneratedAt: new Date('2025-01-15T12:00:00Z'),
        renderFingerprint: 'fp-economics-B',
        pdfRenderFingerprint: 'fp-economics-A',
      } as ValuationReportData
      expect(isPdfLikelyStaleVenus(r)).toBe(true)
    })

    it('falls back to the timestamp heuristic when only one fingerprint is present', () => {
      const r = {
        ...base(),
        reportUpdatedAt: new Date('2025-01-15T12:00:00Z'),
        pdfGeneratedAt: new Date('2025-01-10T12:00:00Z'),
        renderFingerprint: 'fp-economics-A',
        pdfRenderFingerprint: null,
      } as ValuationReportData
      expect(isPdfLikelyStaleVenus(r)).toBe(true)
    })

    it('still falls back to timestamps when pdfUrl exists but only one fingerprint is present', () => {
      const r = {
        ...base(),
        reportUpdatedAt: new Date('2025-01-15T12:00:00Z'),
        pdfGeneratedAt: new Date('2025-01-10T12:00:00Z'),
        pdfUrl: 'https://example.com/report.pdf',
        renderFingerprint: 'fp-economics-A',
        pdfRenderFingerprint: null,
      } as ValuationReportData
      expect(isPdfLikelyStaleVenus(r)).toBe(true)
    })

    it('ignores blank-string fingerprints and uses the timestamp fallback', () => {
      const t = new Date('2025-01-15T12:00:00Z')
      const r = {
        ...base(),
        reportUpdatedAt: t,
        pdfGeneratedAt: t,
        renderFingerprint: '  ',
        pdfRenderFingerprint: '',
      } as ValuationReportData
      expect(isPdfLikelyStaleVenus(r)).toBe(false)
    })
  })
})
