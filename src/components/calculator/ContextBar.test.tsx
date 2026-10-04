import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ContextBar } from './ContextBar'

vi.mock('next-intl', () => ({ useLocale: () => 'fr', useTranslations: () => (key: string) => key }))

describe('valuation context and save status', () => {
  it('announces saving, saved and failed persistence without a misleading saved timestamp', () => {
    const props = {
      businessName: 'Entreprise Exemple',
      lastSaved: new Date('2026-10-01T09:00:00Z'),
    }
    const { rerender } = render(<ContextBar {...props} draftStatus="saving" />)
    expect(screen.getByRole('status')).toHaveTextContent('saving')
    rerender(<ContextBar {...props} draftStatus="saved" />)
    expect(screen.getByRole('status')).toHaveTextContent('saved')
    rerender(<ContextBar {...props} draftStatus="unsaved" />)
    expect(screen.getByRole('status')).toHaveTextContent('notSaved')
    expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument()
  })

  it('keeps identity visible without presenting controls that do nothing', () => {
    render(<ContextBar clientName="Jan Peeters" businessName="Entreprise Exemple" />)
    expect(screen.getByText('Jan Peeters')).toBeInTheDocument()
    expect(screen.getByText('Entreprise Exemple')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('retains the full company name on a working return action', () => {
    const onBusinessClick = vi.fn()
    render(<ContextBar businessName="Entreprise Exemple" onBusinessClick={onBusinessClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Entreprise Exemple' }))
    expect(onBusinessClick).toHaveBeenCalledOnce()
  })
})
