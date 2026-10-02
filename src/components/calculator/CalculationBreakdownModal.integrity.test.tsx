import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '../../../messages/en.json'
import fr from '../../../messages/fr.json'
import nl from '../../../messages/nl.json'
import { CalculationBreakdownModal } from './CalculationBreakdownModal'

vi.unmock('next-intl')

afterEach(cleanup)

describe('calculation panel financial meaning', () => {
  it.each([
    ['en', en],
    ['nl', nl],
    ['fr', fr],
  ] as const)('labels equity and normalized earnings correctly in %s', (locale, messages) => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <CalculationBreakdownModal
          open
          onOpenChange={vi.fn()}
          report={{
            companyName: 'Audit',
            currency: 'GBP',
            valueBasis: 'equity_value',
            valuation: 450.25,
            ebitda: -100,
            normalizedEbitda: 50,
            multiple: 10,
          }}
        />
      </NextIntlClientProvider>
    )
    expect(screen.getByText(messages.calculationBreakdown.equityValue)).toBeInTheDocument()
    expect(screen.getByText(messages.calculationBreakdown.stepEbitda)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('€')
    expect(document.body.textContent).not.toContain('-100')
    expect(document.body.textContent).not.toContain('=')
  })

  it('leaves absent amounts and currency unknown', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <CalculationBreakdownModal
          open
          onOpenChange={vi.fn()}
          report={{
            companyName: 'Audit',
            currency: null,
            valuation: null,
            ebitda: null,
            multiple: null,
          }}
        />
      </NextIntlClientProvider>
    )
    expect(screen.getAllByText('—')).toHaveLength(3)
    expect(document.body.textContent).not.toContain('€0')
    expect(screen.getByText(en.calculationBreakdown.reportedEbitda)).toBeInTheDocument()
  })
})
