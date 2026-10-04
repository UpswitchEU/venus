import { fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '../../../../messages/en.json'
import fr from '../../../../messages/fr.json'
import nl from '../../../../messages/nl.json'
import { DcfForecastDefaultsBlock } from '../sections/DcfForecastDefaultsBlock'
import { DcfProjectionTable } from '../sections/DcfProjectionTable'
import { buildProjectionRowFromForecastRow } from '../sections/dcfProjectionPreview'

// This acceptance case uses the production translations and controls, not the global i18n stub.
vi.unmock('next-intl')

describe.each([
  { locale: 'en', messages: en },
  { locale: 'nl', messages: nl },
  { locale: 'fr', messages: fr },
])('DCF input presentation in $locale', ({ locale, messages }) => {
  it('shows an absent cash-tax assumption as blank and forwards an entered percentage', () => {
    const onFieldChange = vi.fn()
    render(
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        now={new Date('2026-10-02T12:00:00Z')}
        timeZone="Europe/Brussels"
      >
        <DcfForecastDefaultsBlock
          variant="forecastDefaultsOnly"
          dcfInputMode="ebitda"
          dcfDefaultsProvenance="none"
          smartDefaultsPresent
          showDcfInputModeToggle={false}
          onFieldChange={onFieldChange}
          canApplyToForecastYears
          forecastYearCount={1}
        />
      </NextIntlClientProvider>
    )
    expect(screen.getByText(/—%/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch'))
    const input = screen.getByRole('textbox', {
      name: messages.manualInput.methodSelector.fields.dcfTaxRatePct,
    })
    expect(input).toHaveValue('')
    fireEvent.change(input, { target: { value: locale === 'en' ? '25.8' : '25,8' } })
    expect(onFieldChange).toHaveBeenCalledWith('dcf_tax_rate_pct', 25.8)
    expect(
      screen.getByText(messages.manualInput.methodSelector.dcfCashTaxInputHelp)
    ).toBeInTheDocument()
  })

  it('shows unresolved cash flow as a dash while an observed zero remains editable', () => {
    const forecast = { year: '2026', revenue: 100, ebitda: 0 }
    const projection = buildProjectionRowFromForecastRow(forecast, {
      daPct: 3,
      capexPct: 4,
      nwcPct: 1.5,
    })
    render(
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        now={new Date('2026-10-02T12:00:00Z')}
        timeZone="Europe/Brussels"
      >
        <DcfProjectionTable
          open
          onOpenChange={vi.fn()}
          forecastRows={[forecast]}
          projectionRows={[projection]}
          onChange={vi.fn()}
        />
      </NextIntlClientProvider>
    )
    const dialog = screen.getByRole('dialog')
    const fcff = within(dialog)
      .getByText(messages.manualInput.dcfProjectionTable.rows.fcff)
      .closest('tr')
    if (!fcff) throw new Error('Missing FCFF row')
    expect(within(fcff).getByText('—')).toBeInTheDocument()
    const ebitda = within(dialog)
      .getByText(messages.manualInput.dcfProjectionTable.rows.ebitda)
      .closest('tr')
    if (!ebitda) throw new Error('Missing EBITDA row')
    fireEvent.click(ebitda.querySelectorAll('td')[1])
    expect(within(dialog).getByRole('textbox', { name: 'ebitda 2026' })).toHaveValue('0')
  })
})
