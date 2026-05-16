import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Tooltip } from './Tooltip'

describe('Tooltip', () => {
  it('renders safely without an external TooltipProvider', () => {
    render(
      <Tooltip content="Helpful context">
        <button type="button">Hover target</button>
      </Tooltip>
    )

    expect(screen.getByRole('button', { name: 'Hover target' })).toBeInTheDocument()
  })
})
