import { render, screen } from '@testing-library/react'
import type { HTMLAttributes, ReactNode } from 'react'
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
  KBOSearchInput: () => <div data-testid="kbo-search" />,
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
  })
})
