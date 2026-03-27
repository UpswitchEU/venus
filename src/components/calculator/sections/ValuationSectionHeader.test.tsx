import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SectionStatusCircle, ValuationSectionHeader } from './ValuationSectionHeader'

describe('SectionStatusCircle', () => {
  it('uses Aurora primary for numerals in both states (no success green)', () => {
    const { rerender, container } = render(<SectionStatusCircle step={3} complete={false} />)
    let badge = container.querySelector('span[data-state="incomplete"]')
    expect(badge).toBeTruthy()
    expect(badge?.className).toContain('text-primary')
    expect(badge?.className).not.toContain('text-success')

    rerender(<SectionStatusCircle step={3} complete />)
    badge = container.querySelector('span[data-state="complete"]')
    expect(badge?.className).toContain('text-primary')
    expect(badge?.className).not.toContain('text-success')
    expect(badge?.className).toContain('ring-inset')
  })

  it('keeps primary numeral color when className adds layout utilities', () => {
    const { container } = render(<SectionStatusCircle step={1} complete={false} className="flex" />)
    const badge = container.querySelector('span')
    expect(badge?.className).toContain('flex')
    expect(badge?.className).toContain('text-primary')
  })
})

describe('ValuationSectionHeader', () => {
  it('renders the shared circle + title', () => {
    const { getByText, container } = render(
      <ValuationSectionHeader step={2} complete title="Ownership" />
    )
    expect(getByText('2')).toBeInTheDocument()
    expect(getByText('Ownership')).toBeInTheDocument()
    expect(container.querySelector('[data-state="complete"]')).toBeTruthy()
  })
})
