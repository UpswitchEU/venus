import { fireEvent, render, screen } from '@testing-library/react'
import { Briefcase } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { BusinessTypeSearchInput } from '@/design-system/components/entity-search/BusinessTypeSearchInput'
import { CustomBusinessTypeSearch } from './forms/CustomBusinessTypeSearch'

const legacyEntityType = {
  id: 'accounting',
  code: 'Professional Services',
  name: 'Boekhoudkantoor',
  category: 'consulting',
  icon: Briefcase,
  emoji: '📊',
  description: 'Accounting practice',
  popular: true,
}

const apiBusinessType = {
  id: 'accounting',
  title: 'Boekhoudkantoor',
  description: 'Accounting practice',
  icon: '📊',
  category: 'Professional Services',
  category_id: 'professional-services',
  industryMapping: 'Professional Services',
  keywords: ['accounting'],
  popular: true,
  evEbitdaMedian: 5.4,
  multipleBasis: 'EBITDA',
  status: 'active',
  createdAt: '',
  updatedAt: '',
}

describe('legacy business type selector shims', () => {
  it('renders BusinessTypeSearchInput through the shared selector instead of the legacy floating card', () => {
    const onChange = vi.fn()
    const { container } = render(
      <BusinessTypeSearchInput
        label="Bedrijfstype"
        value="accounting"
        types={[legacyEntityType]}
        onChange={onChange}
      />
    )

    expect(screen.getAllByText('Boekhoudkantoor').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Geselecteerde bedrijfstypes')).toBeInTheDocument()
    expect(container.querySelector('.relative.border.rounded-xl.shadow-sm')).toBeNull()
  })

  it('renders CustomBusinessTypeSearch through the shared selector with multiples', () => {
    const onChange = vi.fn()
    const { container } = render(
      <CustomBusinessTypeSearch
        label="Bedrijfstype"
        value="accounting"
        businessTypes={[apiBusinessType]}
        onChange={onChange}
      />
    )

    expect(screen.getAllByText('Boekhoudkantoor').length).toBeGreaterThan(0)
    expect(container.querySelector('.relative.border.rounded-xl.shadow-sm')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Boekhoudkantoor' }))
    expect(screen.getAllByText(/EV\/EBITDA 5.4x/).length).toBeGreaterThan(0)
  })
})
