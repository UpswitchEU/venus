import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SdeSalaryPrefillNormalizationItem } from '@/lib/sde'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import { SdeOwnerCompensationSectionStack } from './SdeOwnerCompensationSectionStack'

type MockSdeSectionProps = {
  step: number
  ownerSalaryAddback?: number
  revenue?: number
  ebitda?: number
  ownerRole?: 'working' | 'passive'
  activeOwnersCount?: number
  salaryPrefillSource?: 'imported_ledger' | 'manual_entry' | null
  salaryPrefillYear?: number | null
  onFieldChange: (field: string, value: number | undefined) => void
  onOwnerRoleChange?: (role: 'working' | 'passive') => void
  onActiveOwnersCountChange?: (count: number) => void
  disabled?: boolean
}

type NormalizationStoreShape = {
  items: SdeSalaryPrefillNormalizationItem[]
}

const mocks = vi.hoisted(() => ({
  items: [] as SdeSalaryPrefillNormalizationItem[],
  sectionProps: [] as MockSdeSectionProps[],
}))

vi.mock('@/store/useNormalizationStore', () => ({
  useNormalizationStore: <T,>(selector: (state: NormalizationStoreShape) => T) =>
    selector({ items: mocks.items }),
}))

vi.mock('@/components/calculator/sections/SdeOwnerCompensationSection', () => ({
  SdeOwnerCompensationSection: (props: MockSdeSectionProps) => {
    mocks.sectionProps.push(props)
    return <div>sde-section:{props.step}</div>
  },
}))

const latestCompleteYearlyFinancial: YearlyFinancials = {
  year: '2024',
  revenue: 1_000_000,
  ebitda: 180_000,
}

function salaryItem(
  partial: Partial<SdeSalaryPrefillNormalizationItem> = {}
): SdeSalaryPrefillNormalizationItem {
  return {
    category: 'salary',
    status: 'accepted',
    value: 88_000,
    adjustment: 30_000,
    year: 2024,
    ...partial,
  }
}

function formData(partial: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  return {
    companyName: 'DemoCo',
    businessType: 'services',
    industry: 'consulting',
    country: 'BE',
    yearFounded: '2015',
    businessStructure: 'BV',
    ownerManagers: 1,
    fteEmployees: undefined,
    yearlyFinancials: [],
    ...partial,
  }
}

describe('SdeOwnerCompensationSectionStack', () => {
  it('renders warning and maps SDE props when salary add-back overlaps an accepted salary normalization', () => {
    const onFieldChange = vi.fn()
    const onAnyFieldChange = vi.fn()
    mocks.items = [salaryItem()]

    render(
      <SdeOwnerCompensationSectionStack
        step={8}
        methods={['sde_multiple']}
        formData={formData({
          owner_salary_addback: 60_000,
          owner_role: 'working',
          number_of_owners: 2,
        } as Partial<ManualValuationFormData>)}
        latestCompleteYearlyFinancial={latestCompleteYearlyFinancial}
        onFieldChange={onFieldChange}
        onAnyFieldChange={onAnyFieldChange}
        disabled
      />
    )

    expect(screen.getByText(/may double-count the adjustment/i)).toBeInTheDocument()
    expect(screen.getByText('sde-section:8')).toBeInTheDocument()
    expect(mocks.sectionProps.at(-1)).toMatchObject({
      step: 8,
      ownerSalaryAddback: 60_000,
      revenue: 1_000_000,
      ebitda: 180_000,
      ownerRole: 'working',
      activeOwnersCount: 2,
      salaryPrefillSource: null,
      salaryPrefillYear: null,
      onFieldChange,
      disabled: true,
    })
    expect(mocks.sectionProps.at(-1).onOwnerRoleChange).toBeTypeOf('function')
    expect(mocks.sectionProps.at(-1).onActiveOwnersCountChange).toBeTypeOf('function')
  })

  it('prefills salary add-back only when SDE is active', async () => {
    const onAnyFieldChange = vi.fn()
    mocks.items = [salaryItem({ value: 88_000, adjustment: 0 })]

    const { rerender } = render(
      <SdeOwnerCompensationSectionStack
        step={8}
        methods={['dcf']}
        formData={formData({ owner_salary_addback: null })}
        latestCompleteYearlyFinancial={latestCompleteYearlyFinancial}
        onFieldChange={vi.fn()}
        onAnyFieldChange={onAnyFieldChange}
      />
    )

    expect(onAnyFieldChange).not.toHaveBeenCalled()

    rerender(
      <SdeOwnerCompensationSectionStack
        step={8}
        methods={['sde_multiple']}
        formData={formData({ owner_salary_addback: null })}
        latestCompleteYearlyFinancial={latestCompleteYearlyFinancial}
        onFieldChange={vi.fn()}
        onAnyFieldChange={onAnyFieldChange}
      />
    )

    await waitFor(() => {
      expect(onAnyFieldChange).toHaveBeenCalledWith('owner_salary_addback', 88_000)
    })
  })
})
