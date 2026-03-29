import { describe, expect, it } from 'vitest'
import { hasUsableOfficialFinancialsContent } from '../officialFinancialsContent'

describe('hasUsableOfficialFinancialsContent', () => {
  it('returns false for undefined or empty stubs', () => {
    expect(hasUsableOfficialFinancialsContent(undefined)).toBe(false)
    expect(hasUsableOfficialFinancialsContent({})).toBe(false)
    expect(
      hasUsableOfficialFinancialsContent({
        sourceLabel: 'NBB filing via Staatsbladmonitor',
        verificationBadge: { state: 'unavailable', label: 'Official filing unavailable' },
        dataHealth: { message: 'Official Belgian financial enrichment failed in Titan.' },
      })
    ).toBe(false)
  })

  it('returns true when any figure or link is present', () => {
    expect(hasUsableOfficialFinancialsContent({ filingYear: 2023 })).toBe(true)
    expect(hasUsableOfficialFinancialsContent({ revenue: 100 })).toBe(true)
    expect(hasUsableOfficialFinancialsContent({ pdfUrl: 'https://example.com/a.pdf' })).toBe(true)
    expect(hasUsableOfficialFinancialsContent({ sourceLinks: ['https://x'] })).toBe(true)
  })
})
