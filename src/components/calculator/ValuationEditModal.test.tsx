import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ValuationEditModal } from './ValuationEditModal'

const translations: Record<string, Record<string, string>> = {
  'manualInput.methodSelector': {
    adaptiveRecommended: 'Upswitch marktbenadering',
    arrMultiple: 'ARR-multiple',
    ebitdaMultiple: 'EBITDA-multiple',
    revenueMultiple: 'Omzet-multiple',
    dcf: 'DCF',
    sdeMultiple: 'SDE-multiple',
    adjustedNav: 'Aangepaste nettovermogenswaarde',
    fiscal4x: 'Fiscaal 4×',
  },
  omniCalc: {
    unavailableTitle: 'Methodedata niet beschikbaar',
    unavailableBlurb: 'Methoden zijn niet geladen. Tik opnieuw op Bereken of vernieuw de pagina.',
    unavailableTitleLegacy: 'Methodedata niet beschikbaar (legacy)',
    unavailableBlurbLegacy: 'Oudere waarderingen.',
    unavailableTitleReportPending: 'Rapport nog niet gekoppeld',
    unavailableBlurbReportPending: 'Wacht even.',
    transientLoadTitle: 'Methodedata tijdelijk niet geladen',
    transientLoadBlurb: 'De server was te druk. Wacht even of vernieuw de pagina.',
    currentMethodAdaptive: 'Upswitch marktbenadering',
    subtitle: 'Kies methode',
    methodsReadyBadge: '{available}/{total} klaar',
    currentMethodLabel: 'Huidig: {method}',
    modeAi: 'Upswitch bepaalt',
    modeManual: 'Handmatig',
    modeLabel: 'Modus',
    stepChooseMethod: 'Kies een methode',
    stepAiActive: 'Marktbenadering actief',
    methodsListHeading: 'Methoden',
    methodsPanoramaTitle: 'Alle methoden in één oogopslag',
    columnEquity: 'Waarde',
    columnMultiple: 'Multiple',
    columnDelta: 't.o.v. marktbenadering',
    columnHintMobile:
      'Elke methoderegel toont de waardering, de gebruikte multiple en het verschil ten opzichte van de Upswitch marktbenadering.',
    adaptiveBaselineLabel: 'Referentie',
    selected: 'Geselecteerd',
    rangeModel: 'model',
    rangeIllustrative: 'illustratief',
    'methodDescriptions.upswitch_adaptive': 'Marktbenadering beschrijving',
    'methodDescriptions.ebitda_multiple': 'EBITDA beschrijving',
    'methodDescriptions.dcf': 'DCF beschrijving',
    planTeaserBadge: 'Starter+',
    planTeaserHint: 'Upgrade voor teaser',
    fiscalAnchor: 'Fiscaal',
    fiscalAnchorFootnote: 'Voetnoot',
    exportZeroDraft: 'Exporteer Zero Draft',
    zeroDraftBlurb: 'Download de Zero Draft als CSV.',
  },
  valuationEditModal: {
    title: 'Waardering bewerken',
    description: 'Pas de waarderingsmethode en EV/EBITDA-multiple aan.',
    loadingTitle: 'Methodedata wordt geladen',
    loadingBlurb:
      'We herstellen de waarderingsmethoden voor dit rapport. Dit duurt normaal maar heel kort.',
    retryMethodDataLoad: 'Opnieuw laden',
    continueImportReview: 'Ga verder met gegevens controleren',
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
    exitMultiple: 'Exit multiple',
    formulaHeading: 'Formule',
    formulaMultiple: 'Formule multiple',
    multiplePipeline: 'Multiple-pijplijn',
    comparablesCount: 'Vergelijkbare bedrijven',
    comparablesQuality: 'Kwaliteit vergelijkbaren',
    'comparablesQualityValues.medium': 'Gemiddeld',
    sensitivityTitle: 'DCF-gevoeligheidsmatrix',
    sensitivityDescription:
      'Ondernemingswaarde bij wijzigingen van +/-1 punt in WACC en terminale groei.',
    sensitivityDescriptionExitMultiple:
      'Ondernemingswaarde bij wijzigingen van +/-1 punt in WACC en exit multiple.',
    sensitivityWaccHeader: 'WACC / g',
    sensitivityWaccExitHeader: 'WACC / exit',
  },
}

vi.mock('next-intl', () => ({
  useLocale: () => 'nl',
  useTranslations:
    (namespace: string) => (key: string, values?: Record<string, string | number>) => {
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

  it('shows accountant import-review recovery when report is still pending', () => {
    const onContinueImportReview = vi.fn()
    const onRetry = vi.fn()
    render(
      <ValuationEditModal
        {...baseProps}
        isHydratingMethods={false}
        methodDataLoadError="report_pending"
        onContinueImportReview={onContinueImportReview}
        onRetryMethodDataLoad={onRetry}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ga verder met gegevens controleren' }))
    expect(onContinueImportReview).toHaveBeenCalledTimes(1)
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
            label: 'Upswitch marktbenadering',
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
    expect(screen.getByText('t.o.v. marktbenadering')).toBeInTheDocument()
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
            label: 'Upswitch marktbenadering',
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
      />
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
            label: 'Upswitch marktbenadering',
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
      />
    )

    expect(
      screen.queryByText(/methodBreakdown\.comparablesQualityValues\.medium/)
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
            label: 'Upswitch marktbenadering',
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
      />
    )

    expect(screen.getByRole('button', { name: 'Discounted Cash Flow' })).toBeDisabled()
    expect(screen.getByText('Revenue below €1M')).toBeInTheDocument()
    expect(screen.queryByText(/Toon alle/)).not.toBeInTheDocument()
  })

  it('returns to Upswitch segment after Handmatig when selectedMethod is still upswitch_adaptive', () => {
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
            label: 'Upswitch marktbenadering',
          },
          ebitda_multiple: {
            available: true,
            value: 120_000,
            label: 'EBITDA Multiple',
          },
        }}
        result={null}
      />
    )

    const aiRadio = screen.getByRole('radio', { name: /Upswitch bepaalt/i })
    const manualRadio = screen.getByRole('radio', { name: /Handmatig/i })

    expect(aiRadio).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(manualRadio)
    expect(onSelectMethod).not.toHaveBeenCalled()
    expect(manualRadio).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(aiRadio)
    expect(onSelectMethod).toHaveBeenCalledWith('upswitch_adaptive')
    expect(screen.getByRole('radio', { name: /Upswitch bepaalt/i })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  it('renders exit multiple DCF semantics truthfully in the breakdown', () => {
    render(
      <ValuationEditModal
        {...baseProps}
        selectedMethod="dcf"
        valuationResults={{
          dcf: {
            available: true,
            value: 410_000,
            label: 'Discounted Cash Flow (DCF)',
            wacc: 0.1,
            details: {
              enterprise_value: 500_000,
              terminal_value: 300_000,
              terminal_value_methodology: 'exit_multiple',
              terminal_exit_multiple: 6,
              sensitivity_matrix_2d: {
                wacc_values: [0.09, 0.1, 0.11],
                secondary_values: [5, 6, 7],
                secondary_axis_key: 'exit_multiple',
                secondary_axis_format: 'multiple',
                ev_matrix: [
                  [480_000, 500_000, 520_000],
                  [390_000, 410_000, 430_000],
                  [320_000, 340_000, 360_000],
                ],
              },
            },
          },
        }}
        result={{} as import('@/types/valuation').ValuationResponse}
      />
    )

    expect(screen.getAllByText('Exit multiple').length).toBeGreaterThan(0)
    expect(screen.getByText('WACC / exit')).toBeInTheDocument()
    expect(
      screen.getByText('Ondernemingswaarde bij wijzigingen van +/-1 punt in WACC en exit multiple.')
    ).toBeInTheDocument()
    // Exit multiple headline uses fixed two-decimal formatting on the metric card.
    // formatMultiple in ValuationEditModal.tsx:66 emits the Unicode multiplication sign (×, U+00D7).
    expect(screen.getByText('6.00×')).toBeInTheDocument()
  })

  it('hides Zero Draft export when downloads are plan-locked', () => {
    render(
      <ValuationEditModal
        {...baseProps}
        selectedMethod="upswitch_adaptive"
        valuationResults={{
          upswitch_adaptive: {
            available: true,
            value: 100_000,
            label: 'Upswitch marktbenadering',
          },
        }}
        showZeroDraftExport
        canExportZeroDraft={false}
        zeroDraftReportId="report-123"
      />
    )

    expect(screen.queryByRole('button', { name: 'Exporteer Zero Draft' })).not.toBeInTheDocument()
  })
})
