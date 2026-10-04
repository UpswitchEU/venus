import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import en from '../../../messages/en.json'
import fr from '../../../messages/fr.json'
import { type HistoryVersion, VersionCompareModal } from './VersionCompareModal'

vi.unmock('next-intl')

vi.mock('@/design-system', async () => ({
  ...(await import('../../design-system/components/Modal')),
  ...(await import('../../design-system/components/Button')),
}))

const older: HistoryVersion = {
  currency: 'EUR',
  valueBasis: 'equity_value',
  id: 'v1',
  version: 1,
  timestamp: new Date('2026-09-01T12:00:00Z'),
  author: 'Advisor',
  authorInitials: 'AD',
  type: 'initial',
  summary: 'Initial valuation',
  changes: [],
  valuation: 100000,
  valuationLow: 80000,
  valuationHigh: undefined,
  ebitda: 0,
  multiple: 0,
}
const newer: HistoryVersion = {
  ...older,
  id: 'v2',
  version: 2,
  summary: 'Updated valuation',
  valuation: 200000,
  valuationLow: 150000,
  valuationHigh: 250000,
  ebitda: -10000,
  multiple: 2,
  isCurrent: true,
}
const restore = vi.fn()
function Fixture({
  locale = 'en',
  readOnly = false,
  restoring = false,
}: {
  locale?: 'en' | 'fr'
  readOnly?: boolean
  restoring?: boolean
}) {
  const [swapped, setSwapped] = useState(false)
  return (
    <NextIntlClientProvider locale={locale} messages={locale === 'fr' ? fr : en}>
      <VersionCompareModal
        open
        onOpenChange={vi.fn()}
        versionA={swapped ? newer : older}
        versionB={swapped ? older : newer}
        onSwap={() => setSwapped((value) => !value)}
        onRestore={readOnly ? undefined : restore}
        restoring={restoring}
      />
    </NextIntlClientProvider>
  )
}

describe('VersionCompareModal', () => {
  it('reverses the visible order, change direction and restore target on swap', () => {
    render(<Fixture />)
    expect(
      screen.getAllByRole('region').map((section) => section.getAttribute('aria-label'))
    ).toEqual(['Version 1', 'Version 2'])
    expect(screen.getByText('v1 → v2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Restore to/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Swap versions' }))
    expect(
      screen.getAllByRole('region').map((section) => section.getAttribute('aria-label'))
    ).toEqual(['Version 2', 'Version 1'])
    expect(screen.getByText('v2 → v1')).toBeInTheDocument()
    expect(screen.getByText('(-50.0%)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore to v1' }))
    expect(restore).toHaveBeenLastCalledWith(older)
  })
  it('keeps zero EBITDA and multiple distinct from unavailable range endpoints', () => {
    render(<Fixture />)
    const table = screen.getByRole('table', { name: 'Detailed Changes' })
    expect(within(table).getByRole('row', { name: /EBITDA/ })).toHaveTextContent('€0')
    expect(within(table).getByRole('row', { name: /Multiple/ })).toHaveTextContent('0.00×')
    const range = within(table).getByRole('row', { name: /Valuation range/ })
    expect(range).toHaveTextContent('Not available')
    expect(range).not.toHaveTextContent('€0')
    expect(
      within(screen.getByRole('region', { name: 'Version 1' })).getByText('€0.00')
    ).toBeInTheDocument()
  })
  it('localizes metric labels, dialog description, currency and close controls', () => {
    render(<Fixture locale="fr" />)
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      /Comparez la version 1 à la version 2/
    )
    expect(screen.getAllByRole('button', { name: 'Fermer' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Modifications détaillées' })
    expect(within(table).getByRole('row', { name: /BAIIA/ })).toHaveTextContent('0,00 €')
    expect(screen.queryByText('Ondernemingswaarde')).not.toBeInTheDocument()
    expect(
      within(table).getByRole('row', { name: /Fourchette de valorisation/ })
    ).toHaveTextContent('Non disponible')
  })
  it('does not expose restoration without a handler after swapping', () => {
    render(<Fixture readOnly />)
    fireEvent.click(screen.getByRole('button', { name: 'Swap versions' }))
    expect(screen.queryByRole('button', { name: /Restore to/ })).not.toBeInTheDocument()
  })
  it('locks the comparison direction while restoration is pending', () => {
    render(<Fixture restoring />)
    expect(screen.getByRole('button', { name: 'Swap versions' })).toBeDisabled()
  })

  it('returns keyboard focus to the comparison trigger after Escape', async () => {
    const user = userEvent.setup()
    function FocusFixture() {
      const [open, setOpen] = useState(false)
      const trigger = useRef<HTMLButtonElement>(null)
      return (
        <NextIntlClientProvider locale="en" messages={en}>
          <button ref={trigger} type="button" onClick={() => setOpen(true)}>
            Compare selected versions
          </button>
          <VersionCompareModal
            open={open}
            onOpenChange={setOpen}
            versionA={older}
            versionB={newer}
            returnFocusRef={trigger}
          />
        </NextIntlClientProvider>
      )
    }
    render(<FocusFixture />)
    const trigger = screen.getByRole('button', { name: 'Compare selected versions' })
    await user.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
