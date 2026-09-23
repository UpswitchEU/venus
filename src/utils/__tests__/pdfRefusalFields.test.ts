import { describe, expect, it } from 'vitest'
import { pickPdfRefusalFields } from '../pdfRefusalFields'

describe('pickPdfRefusalFields', () => {
  it('keeps a non-empty code and remediation, trimmed', () => {
    expect(
      pickPdfRefusalFields({
        code: ' SEALED_REPORT_SUPERSEDED ',
        message: 'internal precondition',
        remediation: ' Open the current version and export from there. ',
        report_id: 'report-1',
      })
    ).toEqual({
      code: 'SEALED_REPORT_SUPERSEDED',
      remediation: 'Open the current version and export from there.',
    })
  })

  it('adds nothing for bodies without them', () => {
    expect(pickPdfRefusalFields({ error: 'PDF generation failed' })).toEqual({})
    expect(pickPdfRefusalFields({ code: 42, remediation: '' })).toEqual({})
    expect(pickPdfRefusalFields(null)).toEqual({})
    expect(pickPdfRefusalFields(['code'])).toEqual({})
  })
})
