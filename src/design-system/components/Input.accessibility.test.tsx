import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AuroraInput, AuroraTextarea } from './Input'
import { AuroraNumberInput } from './NumberInput'

describe('Aurora field labels', () => {
  it('connects stacked labels to distinct fields even without caller IDs', async () => {
    render(
      <>
        <AuroraInput label="Owner-managers" type="number" truncateLabel={false} />
        <AuroraInput label="Total FTE" type="number" truncateLabel={false} />
      </>
    )
    const owners = screen.getByRole('spinbutton', { name: 'Owner-managers' })
    const fte = screen.getByRole('spinbutton', { name: 'Total FTE' })
    expect(owners.id).not.toBe(fte.id)
    await userEvent.setup().click(screen.getByText('Total FTE'))
    expect(fte).toHaveFocus()
  })

  it('preserves explicit IDs and links floating labels and errors', () => {
    render(
      <AuroraInput label="Company" name="company" id="company-control" error="Required" touched />
    )
    const field = screen.getByRole('textbox', { name: 'Company' })
    expect(field).toHaveAttribute('id', 'company-control')
    expect(field).toHaveAccessibleDescription('Required')
    expect(field).toHaveAttribute('aria-invalid', 'true')
  })

  it('names the multiple input and associates its validation feedback', () => {
    render(
      <AuroraNumberInput
        label="EV/EBITDA"
        name="segments.0.multiple"
        value="5.5"
        onChange={vi.fn()}
        error="Review multiple"
        touched
      />
    )
    const field = screen.getByRole('textbox', { name: 'EV/EBITDA' })
    expect(field).toHaveValue('5.5')
    expect(field).toHaveAccessibleDescription('Review multiple')
  })

  it('names text areas without requiring a caller-provided ID', () => {
    render(<AuroraTextarea label="Report purpose" error="Add a purpose" touched />)
    const field = screen.getByRole('textbox', { name: 'Report purpose' })
    expect(field).toHaveAccessibleDescription('Add a purpose')
  })
})
