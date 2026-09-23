// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { PDF_REFUSAL_CODES } from '@/hooks/pdfGenerationModel'
import en from '../../../../messages/en.json'
import fr from '../../../../messages/fr.json'
import nl from '../../../../messages/nl.json'
import { describePdfRefusal } from './pdfRefusalMessage'

describe('describePdfRefusal', () => {
  const translate = (key: string) => `t:${key}`

  it('shows localized copy for a code the client knows', () => {
    expect(
      describePdfRefusal(
        { code: 'SEALED_REPORT_INPUT_INCOMPLETE', remediation: 'English server text' },
        translate
      )
    ).toBe('t:pdfRefusal.SEALED_REPORT_INPUT_INCOMPLETE')
  })

  it("falls back to the server's remediation for a code it does not know yet", () => {
    expect(
      describePdfRefusal({ code: 'SOME_FUTURE_CODE', remediation: 'Do the new thing.' }, translate)
    ).toBe('Do the new thing.')
    expect(describePdfRefusal({ code: null, remediation: 'Do the thing.' }, translate)).toBe(
      'Do the thing.'
    )
  })

  it.each([
    ['en', en],
    ['nl', nl],
    ['fr', fr],
  ])('every known refusal code has %s copy', (_locale, messages) => {
    const refusalCopy = (messages as { toast: { pdfRefusal: Record<string, string> } }).toast
      .pdfRefusal
    for (const code of PDF_REFUSAL_CODES) {
      expect(refusalCopy[code], code).toEqual(expect.any(String))
      expect(refusalCopy[code].trim().length, code).toBeGreaterThan(20)
    }
  })
})
