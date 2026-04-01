import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilingYearPrompt } from '../FilingYearPrompt'

const translations: Record<string, Record<string, string>> = {
  manualInput: {
    filingYearPromptTitle: 'Meest recente afgesloten boekjaar?',
    filingYearPromptDescription:
      'Selecteer het jaar waarvoor de jaarrekening is neergelegd of intern afgerond.',
    filingYearLabelSafeDefault: 'Veilige standaard',
    filingYearLabelBooksClosed: 'Boeken al gesloten',
    filingYearAriaSafeDefault: 'Kies {year}, aanbevolen wanneer de jaarrekening nog niet definitief is',
    filingYearAriaBooksClosed:
      'Kies {year}, wanneer de jaarrekening al is neergelegd of afgerond',
    filingYearOther: 'Ander jaar...',
  },
  'common.actions': {
    apply: 'Toepassen',
  },
}

function interpolate(template: string, values?: Record<string, unknown>) {
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? `{${k}}`))
}

vi.mock('next-intl', () => ({
  useLocale: () => 'nl',
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) =>
    interpolate(translations[namespace]?.[key] ?? key, values),
}))

describe('FilingYearPrompt', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the prompt with the safe default filing year (capped to max selectable)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))
    render(<FilingYearPrompt defaultYear={2024} onSelect={vi.fn()} />)

    expect(screen.getByText('Meest recente afgesloten boekjaar?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /2024/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /2025/ })).not.toBeInTheDocument()
    expect(screen.getByText('Veilige standaard')).toBeInTheDocument()
    expect(screen.queryByText('Boeken al gesloten')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ander jaar...' })).toBeInTheDocument()
  })

  it('calls onSelect with the suggested default year and disappears when parent dismisses it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))
    const handleSelect = vi.fn()

    function Wrapper() {
      const [dismissed, setDismissed] = React.useState(false)
      return (
        <FilingYearPrompt
          defaultYear={2024}
          dismissed={dismissed}
          onSelect={(year) => {
            handleSelect(year)
            setDismissed(true)
          }}
        />
      )
    }

    render(<Wrapper />)
    fireEvent.click(screen.getByRole('button', { name: /2024/ }))

    expect(handleSelect).toHaveBeenCalledWith(2024)
    expect(screen.queryByText('Meest recente afgesloten boekjaar?')).not.toBeInTheDocument()
  })

  it('calls onSelect with a custom year from the form', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))
    const handleSelect = vi.fn()

    render(<FilingYearPrompt defaultYear={2024} onSelect={handleSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ander jaar...' }))
    const input = screen.getByRole('spinbutton', { name: 'Aangepast boekjaar' })
    fireEvent.change(input, { target: { value: '2023' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toepassen' }))

    expect(handleSelect).toHaveBeenCalledWith(2023)
  })

  it('does not render when dismissed is true', () => {
    render(<FilingYearPrompt defaultYear={2024} dismissed onSelect={vi.fn()} />)

    expect(screen.queryByText('Meest recente afgesloten boekjaar?')).not.toBeInTheDocument()
  })

  it('does not offer the in-progress current calendar year in H2', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'))

    render(<FilingYearPrompt defaultYear={2025} onSelect={vi.fn()} />)

    expect(screen.getByRole('button', { name: /2025/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /2026/ })).not.toBeInTheDocument()
  })
})
