import { describe, expect, it } from 'vitest'
import { LEDGER_LABEL_TEXT_CLASSES } from '../ledgerLabelTypography'

describe('ledgerLabelTypography', () => {
  it('documents stable wrapping primitives for grootboek labels', () => {
    expect(LEDGER_LABEL_TEXT_CLASSES).toContain('break-words')
    expect(LEDGER_LABEL_TEXT_CLASSES).toContain('whitespace-normal')
    expect(LEDGER_LABEL_TEXT_CLASSES).toContain('[overflow-wrap:anywhere]')
  })
})
