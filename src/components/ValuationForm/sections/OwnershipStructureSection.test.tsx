import { render } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { OwnershipStructureSection } from './OwnershipStructureSection'

vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string): string =>
      key,
}))

function OwnershipStructureSectionHarness() {
  const [formData, setFormData] = React.useState<any>({
    business_type: 'company',
    number_of_owners: 1,
    number_of_employees: 5,
  })

  return (
    <OwnershipStructureSection
      formData={formData}
      updateFormData={(next) => setFormData((current: Record<string, unknown>) => ({ ...current, ...next }))}
      employeeCountError={null}
      setEmployeeCountError={() => {}}
    />
  )
}

describe('OwnershipStructureSection', () => {
  it('renders the business structure select for companies', () => {
    const { container } = render(<OwnershipStructureSectionHarness />)

    const select = container.querySelector('[role="combobox"], select')
    expect(select).toBeTruthy()
  })

  it('does not render a shares_for_sale input', () => {
    const { container } = render(<OwnershipStructureSectionHarness />)

    const sharesInput = container.querySelector('input[name="shares_for_sale"]')
    expect(sharesInput).toBeNull()
  })
})
