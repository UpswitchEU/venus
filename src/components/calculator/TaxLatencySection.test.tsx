import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useTaxLatencyStore } from '../../store/useTaxLatencyStore'
import { TaxLatencySection } from './TaxLatencySection'

vi.mock('next-intl', () => ({
  useLocale: () => 'nl',
  useTranslations:
    () =>
    (key: string, values?: Record<string, string | number>) =>
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
})
