import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useTaxLatencyStore } from '../../store/useTaxLatencyStore'
import { TaxLatencySection } from './TaxLatencySection'

vi.mock('next-intl', () => ({
  useLocale: () => 'nl',
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values
      ? `${key}:${Object.entries(values)
          .map(([entryKey, value]) => `${entryKey}=${value}`)
          .join(',')}`
      : key,
}))

describe('TaxLatencySection', () => {
  beforeEach(() => {
    useTaxLatencyStore.getState().clear()
    useManualFormStore.getState().resetForm()
    useManualFormStore.getState().updateFormData({ country_code: 'BE' })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        codes: [
          { code: '222000', name: 'Gebouwen', category: 'Vaste activa' },
          { code: '160000', name: 'Voorzieningen', category: 'Voorzieningen' },
        ],
      }),
    } as Response)
  })

  it('uses Titan-backed ledger accounts in the searchable picker', async () => {
    render(<TaxLatencySection alwaysExpanded />)

    const accountInput = screen.getByPlaceholderText('accountPlaceholder')
    fireEvent.focus(accountInput)
    fireEvent.change(accountInput, { target: { value: '222' } })

    const ledgerOption = await screen.findByText('222000')
    fireEvent.click(ledgerOption)

    fireEvent.change(screen.getByPlaceholderText('descriptionPlaceholder'), {
      target: { value: 'Belastinglatentie op gebouw' },
    })
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '150000' } })
    fireEvent.click(screen.getByText('addCta'))

    await waitFor(() => {
      expect(useTaxLatencyStore.getState().items).toEqual([
        expect.objectContaining({
          accountCode: '222000',
          accountName: 'Gebouwen',
          description: 'Belastinglatentie op gebouw',
          temporaryDifference: 150000,
        }),
      ])
    })
  })

  it('renders the NAV-vs-BSA conflict banner only when a passive MAR 22x latency overlaps a positive real-estate revaluation on a BE client', async () => {
    useManualFormStore.getState().updateFormData({
      country_code: 'BE',
      // Active NAV-% applied AND a positive real-estate uplift → both channels
      // would deduct latent tax against the same gain → expect the warning.
      nav_tax_latency_pct: 25,
      nav_real_estate_adjustment: 200000,
    })
    useTaxLatencyStore.getState().setItems([
      {
        id: 'be-real-estate',
        type: 'passive',
        accountCode: '222000',
        accountName: 'Gebouwen',
        description: 'Latentie op gebouw',
        temporaryDifference: 150000,
        taxRate: 25,
      },
    ])

    const { rerender } = render(<TaxLatencySection alwaysExpanded />)

    expect(await screen.findByText('navConflictTitle')).toBeInTheDocument()

    // Same setup but country is NL → BE-prefix matchers are out of scope and
    // we should NOT show the false-positive warning.
    useManualFormStore.getState().updateFormData({ country_code: 'NL' })
    rerender(<TaxLatencySection alwaysExpanded />)
    expect(screen.queryByText('navConflictTitle')).not.toBeInTheDocument()
  })

  it('does not render the conflict banner before the form has assigned a country (undefined country_code)', async () => {
    // Strip country_code so it's undefined — the conflict heuristic must NOT
    // fire because BE-specific MAR rules would yield false positives during
    // initial form hydration.
    useManualFormStore.getState().resetForm()
    useManualFormStore.getState().updateFormData({
      nav_tax_latency_pct: 25,
      nav_real_estate_adjustment: 200000,
    })
    useTaxLatencyStore.getState().setItems([
      {
        id: 'be-real-estate',
        type: 'passive',
        accountCode: '222000',
        accountName: 'Gebouwen',
        description: 'Latentie op gebouw',
        temporaryDifference: 150000,
        taxRate: 25,
      },
    ])

    render(<TaxLatencySection alwaysExpanded />)
    expect(screen.queryByText('navConflictTitle')).not.toBeInTheDocument()
  })

  it('does not render the conflict banner when the NAV % is 0 or no positive uplift is set', async () => {
    useManualFormStore.getState().updateFormData({
      country_code: 'BE',
      nav_tax_latency_pct: 0,
      nav_real_estate_adjustment: 200000,
    })
    useTaxLatencyStore.getState().setItems([
      {
        id: 'be-real-estate',
        type: 'passive',
        accountCode: '222000',
        accountName: 'Gebouwen',
        description: 'Latentie op gebouw',
        temporaryDifference: 150000,
        taxRate: 25,
      },
    ])

    render(<TaxLatencySection alwaysExpanded />)
    expect(screen.queryByText('navConflictTitle')).not.toBeInTheDocument()
  })

  it('dismisses a suggested candidate after saving it as a tax latency row', async () => {
    useTaxLatencyStore.getState().setCandidates([
      {
        id: 'candidate-1',
        type: 'passive',
        accountCode: '160000',
        accountName: 'Voorzieningen',
        description: 'Latentie op voorziening',
        suggestedQuestion:
          'Opgelet: MAR 160000 bevat voorzieningen. Wilt u hier een belastinglatentie op toepassen?',
        temporaryDifference: 50000,
        taxRate: 25,
      },
    ])

    render(<TaxLatencySection alwaysExpanded />)

    fireEvent.click(screen.getByText('reviewCandidate'))
    fireEvent.click(screen.getByText('addCta'))

    await waitFor(() => {
      expect(useTaxLatencyStore.getState().candidates).toEqual([])
      expect(useTaxLatencyStore.getState().items).toEqual([
        expect.objectContaining({
          accountCode: '160000',
          accountName: 'Voorzieningen',
          description: 'Latentie op voorziening',
        }),
      ])
    })
  })

  it('groups duplicate imported balance signals and dismisses the whole group', async () => {
    const question =
      'Opgelet: MAR 630200 bevat vastgoed. Wilt u hier een belastinglatentie op toepassen?'
    useTaxLatencyStore.getState().setCandidates([
      {
        id: 'candidate-2021',
        type: 'passive',
        accountCode: '630200',
        accountName: 'Depreciation of buildings',
        description:
          'Opgelet: Depreciation of buildings lijkt vastgoed te bevatten. Vul de bruto meerwaarde boven boekwaarde in.',
        suggestedQuestion: question,
        taxRate: 25,
        year: 2021,
      },
      {
        id: 'candidate-2022',
        type: 'passive',
        accountCode: '630200',
        accountName: 'Depreciation of buildings',
        description:
          'Opgelet: Depreciation of buildings lijkt vastgoed te bevatten. Vul de bruto meerwaarde boven boekwaarde in.',
        suggestedQuestion: question,
        taxRate: 25,
        year: 2022,
      },
    ])

    render(<TaxLatencySection alwaysExpanded />)

    expect(screen.getAllByText(question)).toHaveLength(1)
    expect(screen.getByText('candidateYearsRange:start=2021,end=2022,count=2')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('dismissSuggestion'))

    await waitFor(() => {
      expect(useTaxLatencyStore.getState().candidates).toEqual([])
    })
  })

  it('prefills and focuses the gross surplus input for zero-value imported candidates', async () => {
    useTaxLatencyStore.getState().setCandidates([
      {
        id: 'candidate-zero',
        type: 'passive',
        accountCode: '630200',
        accountName: 'Depreciation of buildings',
        description:
          'Opgelet: Depreciation of buildings lijkt vastgoed te bevatten. Vul de bruto meerwaarde boven boekwaarde in.',
        suggestedQuestion:
          'Opgelet: MAR 630200 bevat vastgoed. Wilt u hier een belastinglatentie op toepassen?',
        taxRate: 25,
        year: 2025,
      },
    ])

    render(<TaxLatencySection alwaysExpanded />)

    fireEvent.click(screen.getByText('reviewCandidate'))

    expect(screen.getByPlaceholderText('accountPlaceholder')).toHaveValue(
      '630200 · Depreciation of buildings'
    )
    expect(screen.getByPlaceholderText('descriptionPlaceholder')).toHaveValue(
      'Opgelet: Depreciation of buildings lijkt vastgoed te bevatten. Vul de bruto meerwaarde boven boekwaarde in.'
    )

    const amountInput = screen.getByPlaceholderText('0')
    await waitFor(() => {
      expect(amountInput).toHaveFocus()
    })
    expect(useTaxLatencyStore.getState().items).toEqual([])
  })
})
