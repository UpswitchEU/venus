import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ValuationEditModal } from './ValuationEditModal'

const translations: Record<string, Record<string, string>> = {
  omniCalc: {
    unavailableTitle: 'Methodedata niet beschikbaar',
    unavailableBlurb: 'Methoden zijn niet geladen. Tik opnieuw op Bereken of vernieuw de pagina.',
    currentMethodAdaptive: 'UpSwitch Adaptive',
  },
  valuationEditModal: {
    title: 'Waardering bewerken',
    description: 'Pas de waarderingsmethode en EV/EBITDA-multiple aan.',
    loadingTitle: 'Methodedata wordt geladen',
    loadingBlurb:
      'We herstellen de waarderingsmethoden voor dit rapport. Dit duurt normaal maar heel kort.',
  },
  preparerMultiple: {
    contextSeparator: ' · ',
  },
}

vi.mock('next-intl', () => ({
  useLocale: () => 'nl',
  useTranslations: (namespace: string) => (key: string) => translations[namespace]?.[key] ?? key,
}))

vi.mock('@/design-system/components/Modal', () => ({
  Modal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ModalContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ModalHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ModalTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

describe('ValuationEditModal', () => {
  const baseProps = {
    open: true,
    onClose: vi.fn(),
    valuationResults: {},
    selectedMethod: 'upswitch_adaptive',
    onSelectMethod: vi.fn(),
    result: null,
  }

  it('shows a loading state while methods are still hydrating', () => {
    render(<ValuationEditModal {...baseProps} isHydratingMethods />)

    expect(screen.getByText('Methodedata wordt geladen')).toBeInTheDocument()
    expect(
      screen.getByText(
        'We herstellen de waarderingsmethoden voor dit rapport. Dit duurt normaal maar heel kort.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText('Methodedata niet beschikbaar')).not.toBeInTheDocument()
  })

  it('shows the unavailable state only when hydration has finished without methods', () => {
    render(<ValuationEditModal {...baseProps} isHydratingMethods={false} />)

    expect(screen.getByText('Methodedata niet beschikbaar')).toBeInTheDocument()
    expect(
      screen.getByText('Methoden zijn niet geladen. Tik opnieuw op Bereken of vernieuw de pagina.')
    ).toBeInTheDocument()
  })
})
