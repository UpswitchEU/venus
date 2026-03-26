import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FilingYearPrompt } from '../FilingYearPrompt'

const translations: Record<string, Record<string, string>> = {
  manualInput: {
    filingYearPromptTitle: 'Meest recente afgesloten boekjaar?',
    filingYearPromptDescription:
      'Selecteer het jaar waarvoor de jaarrekening is neergelegd of intern afgerond.',
    filingYearOther: 'Ander jaar...',
  },
  'common.actions': {
    apply: 'Toepassen',
  },
}

vi.mock('next-intl', () => ({
  useLocale: () => 'nl',
  useTranslations: (namespace: string) => (key: string) => translations[namespace]?.[key] ?? key,
}))

describe('FilingYearPrompt', () => {
  it('renders the prompt with the default filing year and next year options', () => {
    render(<FilingYearPrompt defaultYear={2024} onSelect={vi.fn()} />)

    expect(screen.getByText('Meest recente afgesloten boekjaar?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2024' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2025' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ander jaar...' })).toBeInTheDocument()
  })

  it('calls onSelect with the suggested default year and disappears when parent dismisses it', () => {
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
    fireEvent.click(screen.getByRole('button', { name: '2024' }))

    expect(handleSelect).toHaveBeenCalledWith(2024)
    expect(screen.queryByText('Meest recente afgesloten boekjaar?')).not.toBeInTheDocument()
  })

  it('calls onSelect with the next year option', () => {
    const handleSelect = vi.fn()

    render(<FilingYearPrompt defaultYear={2024} onSelect={handleSelect} />)
    fireEvent.click(screen.getByRole('button', { name: '2025' }))

    expect(handleSelect).toHaveBeenCalledWith(2025)
  })

  it('does not render when dismissed is true', () => {
    render(<FilingYearPrompt defaultYear={2024} dismissed onSelect={vi.fn()} />)

    expect(screen.queryByText('Meest recente afgesloten boekjaar?')).not.toBeInTheDocument()
  })
})
