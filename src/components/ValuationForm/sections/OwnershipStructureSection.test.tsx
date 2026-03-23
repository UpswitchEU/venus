import { fireEvent, render, waitFor } from '@testing-library/react'
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
    shares_for_sale: 100,
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
  it('restores the last valid shareholding value when invalid precision is blurred', async () => {
    const { container } = render(<OwnershipStructureSectionHarness />)

    const sharesInput = container.querySelector('input[name="shares_for_sale"]')
    if (!sharesInput) {
      throw new Error('Expected shares_for_sale input to render')
    }

    await waitFor(() => expect(sharesInput.value).toBe('100.00'))

    fireEvent.focus(sharesInput)
    fireEvent.change(sharesInput, { target: { value: '33.33' } })
    fireEvent.blur(sharesInput)

    await waitFor(() => expect(sharesInput.value).toBe('33.33'))

    fireEvent.focus(sharesInput)
    fireEvent.change(sharesInput, { target: { value: '33.333' } })
    fireEvent.blur(sharesInput)

    await waitFor(() => expect(sharesInput.value).toBe('33.33'))

    fireEvent.focus(sharesInput)
    fireEvent.change(sharesInput, { target: { value: '100.01' } })
    fireEvent.blur(sharesInput)

    await waitFor(() => expect(sharesInput.value).toBe('33.33'))
  })

  it('keeps 0 as a valid boundary instead of coercing back to 100', async () => {
    const { container } = render(<OwnershipStructureSectionHarness />)

    const sharesInput = container.querySelector('input[name="shares_for_sale"]')
    if (!sharesInput) {
      throw new Error('Expected shares_for_sale input to render')
    }

    fireEvent.focus(sharesInput)
    fireEvent.change(sharesInput, { target: { value: '0' } })
    fireEvent.blur(sharesInput)

    await waitFor(() => expect(sharesInput.value).toBe('0.00'))
  })
})
