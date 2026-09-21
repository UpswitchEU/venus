import { fireEvent, render, screen } from '@testing-library/react'
import { type ComponentProps, type HTMLAttributes, type ReactNode, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { KBOCompany } from '@/design-system'
import type { ManualValuationFormData } from '../../../types/valuation'
import { CompanyIdentificationSection } from './CompanyIdentificationSection'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      animate,
      children,
      exit,
      initial,
      transition,
      ...props
    }: {
      animate?: unknown
      children?: ReactNode
      exit?: unknown
      initial?: unknown
      transition?: unknown
    } & HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}))

vi.mock('@/design-system', () => ({
  AuroraNumberInput: ({ label }: { label: string }) => <label>{label}</label>,
  KBOSearchInput: ({
    onChange,
    value,
    label,
  }: {
    onChange: (name: string) => void
    value: string
    label: string
  }) => (
    <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
  KboConfirmedCard: () => <div data-testid="kbo-confirmed" />,
}))

vi.mock('@/design-system/components/Select', () => ({
  AuroraSelect: ({ label }: { label: string }) => <label>{label}</label>,
}))

vi.mock('../../BusinessTypeSelector', () => ({
  BusinessTypeSelector: ({
    fallbackOptions,
    value,
  }: {
    fallbackOptions?: Array<{
      id: string
      title: string
      primaryMultiple?: { label?: string | null; median?: number | null }
    }>
    value: string[]
  }) => (
    <div data-testid="business-type-selector">
      <div data-testid="business-type-value">{value.join(',')}</div>
      {fallbackOptions?.map((option) => (
        <div key={option.id} data-testid={`fallback-${option.id}`}>
          {option.title}
          {option.primaryMultiple?.median
            ? ` ${option.primaryMultiple.label} ${option.primaryMultiple.median.toFixed(1)}x`
            : null}
        </div>
      ))}
    </div>
  ),
}))

const selectedCompany: KBOCompany = {
  id: '0631747439',
  name: 'Boekhoudkantoor Venus',
  kboNumber: '0631.747.439',
  legalForm: 'BV',
  address: '',
  city: 'Antwerpen',
  countryCode: 'BE',
  canonicalNaceCode: '69201',
  naceCode: '69201',
  businessTypeId: 'accounting',
  businessTypeTitle: 'Boekhoudkantoor',
  businessTypeIds: ['accounting', 'tax-advisory'],
  businessTypeCandidates: [
    { id: 'accounting', title: 'Boekhoudkantoor', naceCode: '69201' },
    { id: 'tax-advisory', title: 'Fiscaal advies', naceCode: '69202' },
  ],
}

const formData = {
  businessType: 'accounting',
  business_type_id: 'accounting',
  business_type_title: 'Boekhoudkantoor',
  business_type_segments: [
    {
      business_type_id: 'accounting',
      business_type_title: 'Boekhoudkantoor',
      basis: 'EBITDA',
      multiple: 5.4,
    },
    {
      business_type_id: 'tax-advisory',
      business_type_title: 'Fiscaal advies',
      basis: 'EBITDA',
      multiple: 6.1,
    },
  ],
  businessStructure: 'bv',
  companyName: 'Boekhoudkantoor Venus',
  country: 'BE',
  industry: 'Professional Services',
  yearFounded: '',
  ownerManagers: 1,
  fteEmployees: undefined,
  yearlyFinancials: [],
} as ManualValuationFormData

describe('CompanyIdentificationSection business type fallbacks', () => {
  it('passes KBO-derived selected segments with multiples to the selector', () => {
    render(
      <CompanyIdentificationSection
        formData={formData}
        initialData={{}}
        readOnlyKbo={false}
        isCalculating={false}
        selectedCompany={selectedCompany}
        setSelectedCompany={vi.fn()}
        companySearchValue="Boekhoudkantoor Venus"
        setCompanySearchValue={vi.fn()}
        countryUserOverrideRef={{ current: false }}
        updateField={vi.fn()}
        updateFormData={vi.fn()}
        localizeActivityCodeCopy={(text) => text}
        searchCountry="BE"
        kboSearchFn={vi.fn()}
        handleCompanySelect={vi.fn()}
        handleClearCompany={vi.fn()}
        showChangeCompanyWarning={false}
        prefillCompanyRef={{ current: null }}
        setShowChangeCompanyWarning={vi.fn()}
        executeClearCompany={vi.fn()}
        nacePrefillError={null}
        retryNacePrefill={vi.fn()}
        selectedBusinessType={null}
        selectedBusinessTypeIds={['accounting', 'tax-advisory']}
        effectiveMethods={['ebitda_multiple']}
        handleBusinessTypeSelectionChange={vi.fn()}
      />
    )

    expect(screen.getByTestId('business-type-value')).toHaveTextContent('accounting,tax-advisory')
    expect(screen.getByTestId('fallback-accounting')).toHaveTextContent(
      'Boekhoudkantoor EV/EBITDA 5.4x'
    )
    expect(screen.getByTestId('fallback-tax-advisory')).toHaveTextContent(
      'Fiscaal advies EV/EBITDA 6.1x'
    )
    // The segment-weighting panel renders one weight slider per segment and a
    // read-only, basis-labelled multiple chip (earnings input was removed).
    expect(screen.getAllByRole('slider')).toHaveLength(2)
    expect(screen.getByText('EV/EBITDA 5.4×')).toBeInTheDocument()
    expect(screen.getByText('EV/EBITDA 6.1×')).toBeInTheDocument()
  })

  it('passes KBO candidate multiples to the selector before segment earnings exist', () => {
    render(
      <CompanyIdentificationSection
        formData={{
          ...formData,
          business_type_segments: [],
        }}
        initialData={{}}
        readOnlyKbo={false}
        isCalculating={false}
        selectedCompany={{
          ...selectedCompany,
          businessTypeCandidates: [
            {
              id: 'accounting',
              title: 'Boekhoudkantoor',
              naceCode: '69201',
              primaryMultiple: {
                label: 'EV/EBITDA',
                basis: 'EBITDA',
                median: 5.4,
              },
            },
            {
              id: 'tax-advisory',
              title: 'Fiscaal advies',
              naceCode: '69202',
              primaryMultiple: {
                label: 'EV/Revenue',
                basis: 'Revenue',
                median: 1.2,
              },
            },
          ],
        }}
        setSelectedCompany={vi.fn()}
        companySearchValue="Boekhoudkantoor Venus"
        setCompanySearchValue={vi.fn()}
        countryUserOverrideRef={{ current: false }}
        updateField={vi.fn()}
        updateFormData={vi.fn()}
        localizeActivityCodeCopy={(text) => text}
        searchCountry="BE"
        kboSearchFn={vi.fn()}
        handleCompanySelect={vi.fn()}
        handleClearCompany={vi.fn()}
        showChangeCompanyWarning={false}
        prefillCompanyRef={{ current: null }}
        setShowChangeCompanyWarning={vi.fn()}
        executeClearCompany={vi.fn()}
        nacePrefillError={null}
        retryNacePrefill={vi.fn()}
        selectedBusinessType={null}
        selectedBusinessTypeIds={['accounting', 'tax-advisory']}
        effectiveMethods={['ebitda_multiple']}
        handleBusinessTypeSelectionChange={vi.fn()}
      />
    )

    expect(screen.getByTestId('fallback-accounting')).toHaveTextContent(
      'Boekhoudkantoor EV/EBITDA 5.4x'
    )
    expect(screen.getByTestId('fallback-tax-advisory')).toHaveTextContent(
      'Fiscaal advies EV/Revenue 1.2x'
    )
  })
})

describe('optional registry identification', () => {
  it('persists a manual company name and reveals business type without a registry selection', () => {
    const updateFormData = vi.fn()
    function ManualCompany() {
      const [name, setName] = useState('')
      const [data, setData] = useState({ ...formData, companyName: '', businessType: '' })
      const props = {
        formData: data,
        initialData: {},
        readOnlyKbo: false,
        isCalculating: false,
        selectedCompany: null,
        setSelectedCompany: vi.fn(),
        companySearchValue: name,
        setCompanySearchValue: setName,
        countryUserOverrideRef: { current: false },
        updateField: (key: string, value: unknown) =>
          setData((previous) => ({ ...previous, [key]: value })),
        updateFormData,
        localizeActivityCodeCopy: (copy: string) => copy,
        searchCountry: 'BE',
        kboSearchFn: vi.fn().mockRejectedValue(new Error('registry unavailable')),
        handleCompanySelect: vi.fn(),
        handleClearCompany: vi.fn(),
        showChangeCompanyWarning: false,
        prefillCompanyRef: { current: null },
        setShowChangeCompanyWarning: vi.fn(),
        executeClearCompany: vi.fn(),
        nacePrefillError: null,
        retryNacePrefill: vi.fn(),
        selectedBusinessType: null,
        selectedBusinessTypeIds: [],
        effectiveMethods: [],
        handleBusinessTypeSelectionChange: vi.fn(),
      } as ComponentProps<typeof CompanyIdentificationSection>
      return <CompanyIdentificationSection {...props} />
    }
    render(<ManualCompany />)
    expect(screen.queryByTestId('business-type-selector')).toBeNull()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Manual Acme' } })
    expect(updateFormData).toHaveBeenCalledWith({ company_name: 'Manual Acme' })
    expect(screen.getByTestId('business-type-selector')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'continueWithoutRegistry' }))
    expect(document.getElementById('manual-business-type')).toHaveFocus()
    expect(updateFormData.mock.calls.every(([update]) => !('kbo_number' in update))).toBe(true)
  })
})
