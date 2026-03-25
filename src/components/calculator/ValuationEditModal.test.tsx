import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ValuationEditModal } from './ValuationEditModal'

const translations: Record<string, Record<string, string>> = {
  omniCalc: {
    unavailableTitle: 'Methodedata niet beschikbaar',
    unavailableBlurb: 'Methoden zijn niet geladen. Tik opnieuw op Bereken of vernieuw de pagina.',
    unavailableTitleLegacy: 'Methodedata niet beschikbaar (legacy)',
    unavailableBlurbLegacy: 'Oudere waarderingen.',
    unavailableTitleReportPending: 'Rapport nog niet gekoppeld',
    unavailableBlurbReportPending: 'Wacht even.',
    transientLoadTitle: 'Methodedata tijdelijk niet geladen',
    transientLoadBlurb: 'De server was te druk. Wacht even of vernieuw de pagina.',
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
    methodsPanoramaTitle: 'Alle methoden in één oogopslag',
    columnEquity: 'Waarde',
    columnMultiple: 'Multiple',
    columnDelta: 't.o.v. Adaptive',
    columnHintMobile: 'Elke methoderegel toont de waardering, de gebruikte multiple en het verschil ten opzichte van UpSwitch Adaptive.',
    adaptiveBaselineLabel: 'Referentie',
    selected: 'Geselecteerd',
    rangeModel: 'model',
    rangeIllustrative: 'illustratief',
    'methodDescriptions.upswitch_adaptive': 'Adaptive beschrijving',
    'methodDescriptions.ebitda_multiple': 'EBITDA beschrijving',
    'methodDescriptions.dcf': 'DCF beschrijving',
    fiscalAnchor: 'Fiscaal',
    fiscalAnchorFootnote: 'Voetnoot',
  },
  valuationEditModal: {
    title: 'Waardering bewerken',
    description: 'Pas de waarderingsmethode en EV/EBITDA-multiple aan.',
    loadingTitle: 'Methodedata wordt geladen',
    loadingBlurb:
      'We herstellen de waarderingsmethoden voor dit rapport. Dit duurt normaal maar heel kort.',
    retryMethodDataLoad: 'Opnieuw laden',
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
    expect(screen.queryByText('Methodedata niet beschikbaar (legacy)')).not.toBeInTheDocument()
  })

  it('shows the unavailable state only when hydration has finished without methods', () => {
    render(<ValuationEditModal {...baseProps} isHydratingMethods={false} />)

    expect(screen.getByText('Methodedata niet beschikbaar (legacy)')).toBeInTheDocument()
    expect(screen.getByText('Oudere waarderingen.')).toBeInTheDocument()
  })

  it('shows transient copy and retry when load failed transiently', () => {
    const onRetry = vi.fn()
    render(
      <ValuationEditModal
        {...baseProps}
        isHydratingMethods={false}
        methodDataLoadError="transient"
        onRetryMethodDataLoad={onRetry}
      />
    )

    expect(screen.getByText('Methodedata tijdelijk niet geladen')).toBeInTheDocument()
    expect(
      screen.getByText('De server was te druk. Wacht even of vernieuw de pagina.')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Opnieuw laden' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows report_pending copy and retry when by-session report is not linked yet', () => {
    const onRetry = vi.fn()
    render(
      <ValuationEditModal
        {...baseProps}
        isHydratingMethods={false}
        methodDataLoadError="report_pending"
        onRetryMethodDataLoad={onRetry}
      />
    )

    expect(screen.getByText('Rapport nog niet gekoppeld')).toBeInTheDocument()
    expect(screen.getByText('Wacht even.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Opnieuw laden' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders the unified panorama with heading and desktop metric labels', () => {
    render(
      <ValuationEditModal
        {...baseProps}
        valuationResults={{
          upswitch_adaptive: {
            available: true,
            value: 257_000,
            label: 'UpSwitch Adaptive',
          },
          ebitda_multiple: {
            available: true,
            value: 250_000,
            label: 'EBITDA Multiple',
          },
        }}
        selectedMethod="ebitda_multiple"
      />
    )

    expect(screen.queryByText('Methodedata niet beschikbaar')).not.toBeInTheDocument()
    expect(screen.getByText('Waardering bewerken')).toBeInTheDocument()
    expect(screen.getByText('Alle methoden in één oogopslag')).toBeInTheDocument()
    expect(screen.getByText('Waarde')).toBeInTheDocument()
    expect(screen.getAllByText('Multiple').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('t.o.v. Adaptive')).toBeInTheDocument()
    expect(screen.getByText('Referentie')).toBeInTheDocument()
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

  it('shows unavailable methods as disabled panorama rows with their reason', () => {
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
            available: false,
            unavailable_reason: 'Revenue below €1M',
            label: 'Discounted Cash Flow',
          },
        }}
        result={null}
      />,
    )

    expect(screen.getByRole('button', { name: 'Discounted Cash Flow' })).toBeDisabled()
    expect(screen.getByText('Revenue below €1M')).toBeInTheDocument()
    expect(screen.queryByText(/Toon alle/)).not.toBeInTheDocument()
  })

  it('returns to Adaptive segment after Handmatig when selectedMethod is still upswitch_adaptive', () => {
    const onSelectMethod = vi.fn()
    render(
      <ValuationEditModal
        {...baseProps}
        onSelectMethod={onSelectMethod}
        selectedMethod="upswitch_adaptive"
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
        result={null}
      />,
    )

    const aiRadio = screen.getByRole('radio', { name: /Adaptive/i })
    const manualRadio = screen.getByRole('radio', { name: /Handmatig/i })

    expect(aiRadio).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(manualRadio)
    expect(onSelectMethod).not.toHaveBeenCalled()
    expect(manualRadio).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(aiRadio)
    expect(onSelectMethod).toHaveBeenCalledWith('upswitch_adaptive')
    expect(
      screen.getByRole('radio', { name: /Adaptive/i }),
    ).toHaveAttribute('aria-checked', 'true')
  })
})
