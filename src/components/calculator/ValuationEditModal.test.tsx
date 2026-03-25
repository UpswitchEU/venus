import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ValuationEditModal } from './ValuationEditModal'

const translations: Record<string, Record<string, string>> = {
  omniCalc: {
    unavailableTitle: 'Methodedata niet beschikbaar',
    unavailableBlurb: 'Methoden zijn niet geladen. Tik opnieuw op Bereken of vernieuw de pagina.',
    currentMethodAdaptive: 'UpSwitch Adaptive',
    subtitle: 'Kies methode',
    methodsReadyBadge: '{available}/{total} klaar',
    currentMethodLabel: 'Huidig: {method}',
    modeAi: 'Adaptive',
    modeManual: 'Handmatig',
    modeLabel: 'Modus',
    stepChooseMethod: 'Kies een methode',
    stepAiActive: 'Adaptive actief',
    methodsListHeading: 'Methoden',
    showAllMethods: 'Toon alle ({count})',
    selected: 'Geselecteerd',
    rangeModel: 'model',
    rangeIllustrative: 'illustratief',
    fiscalAnchor: 'Fiscaal',
    fiscalAnchorFootnote: 'Voetnoot',
  },
  valuationEditModal: {
    title: 'Waardering bewerken',
    description: 'Pas de waarderingsmethode en EV/EBITDA-multiple aan.',
    loadingTitle: 'Methodedata wordt geladen',
    loadingBlurb:
      'We herstellen de waarderingsmethoden voor dit rapport. Dit duurt normaal maar heel kort.',
    methodSection: 'Methode',
    persistingMethod: 'Methode opslaan en rapport vernieuwen…',
  },
  preparerMultiple: {
    contextSeparator: ' · ',
  },
  methodBreakdown: {
    comparisonTitle: 'Vergelijking',
    title: 'Berekeningstransparantie',
    subtitle: 'Stap-voor-stap voor {method}',
    normalizedEbitda: 'Genormaliseerde EBITDA',
    benchmarkMultiple: 'Benchmarkmultiple',
    appliedMultiple: 'Toegepaste multiple',
    enterpriseValue: 'Ondernemingswaarde',
    equityValue: 'Aandelenwaarde',
    formulaHeading: 'Formule',
    formulaMultiple: 'Formule multiple',
    multiplePipeline: 'Multiple-pijplijn',
    comparablesCount: 'Vergelijkbare bedrijven',
    comparablesQuality: 'Kwaliteit vergelijkbaren',
    'comparablesQualityValues.medium': 'Gemiddeld',
  },
}

vi.mock('next-intl', () => ({
  useLocale: () => 'nl',
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string | number>) => {
    let raw = translations[namespace]?.[key] ?? key
    if (values && typeof raw === 'string') {
      for (const [k, v] of Object.entries(values)) {
        raw = raw.replace(`{${k}}`, String(v))
      }
    }
    return raw
  },
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

  it('renders method options when a persisted method map is available', () => {
    render(
      <ValuationEditModal
        {...baseProps}
        valuationResults={{
          ebitda_multiple: {
            available: true,
            value: 250000,
            label: 'EBITDA Multiple',
          },
        }}
      />
    )

    expect(screen.queryByText('Methodedata niet beschikbaar')).not.toBeInTheDocument()
    expect(screen.getByText('Waardering bewerken')).toBeInTheDocument()
  })

  it('shows persist status and disables mode radios while method is saving', () => {
    render(
      <ValuationEditModal
        {...baseProps}
        valuationResults={{
          upswitch_adaptive: {
            available: true,
            value: 100_000,
            label: 'UpSwitch Adaptive',
          },
          ebitda_multiple: {
            available: true,
            value: 120_000,
            label: 'EBITDA Multiple',
          },
        }}
        selectedMethod="ebitda_multiple"
        isMethodPersisting
        result={null}
      />,
    )

    expect(screen.getByText('Methode opslaan en rapport vernieuwen…')).toBeInTheDocument()

    const radios = screen.getAllByRole('radio')
    expect(radios.length).toBeGreaterThanOrEqual(2)
    for (const radio of radios) {
      expect(radio).toBeDisabled()
    }
  })

  it('renders translated comparables quality label for API value medium (not raw i18n key)', () => {
    render(
      <ValuationEditModal
        {...baseProps}
        valuationResults={{
          upswitch_adaptive: {
            available: true,
            value: 357_000,
            label: 'UpSwitch Adaptive',
          },
        }}
        result={
          {
            ebitda: 100_000,
            multiples_valuation: {
              comparables_count: 0,
              comparables_quality: 'medium',
              ebitda_multiple: 4.75,
              enterprise_value: 479_000,
            },
            details: {
              sustainable_ebitda: 100_000,
            },
          } as import('@/types/valuation').ValuationResponse
        }
      />,
    )

    expect(
      screen.queryByText(/methodBreakdown\.comparablesQualityValues\.medium/),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Kwaliteit vergelijkbaren')).toBeInTheDocument()
    expect(screen.getByText('Gemiddeld')).toBeInTheDocument()
  })

  it('lists DCF in the primary method list when all methods are primary (no “show all”)', () => {
    render(
      <ValuationEditModal
        {...baseProps}
        selectedMethod="ebitda_multiple"
        valuationResults={{
          upswitch_adaptive: {
            available: true,
            value: 100_000,
            label: 'UpSwitch Adaptive',
          },
          ebitda_multiple: {
            available: true,
            value: 120_000,
            label: 'EBITDA Multiple',
          },
          dcf: {
            available: true,
            value: 99_000,
            label: 'Discounted Cash Flow',
          },
        }}
        result={null}
      />,
    )

    expect(screen.getAllByText('Discounted Cash Flow').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/Toon alle/)).not.toBeInTheDocument()
  })
})
