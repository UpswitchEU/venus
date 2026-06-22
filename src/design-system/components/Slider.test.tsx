import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Slider } from './Slider'

function stubSliderRect(element: HTMLElement) {
  element.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 100,
      height: 20,
      right: 100,
      bottom: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect
}

describe('Slider', () => {
  it('commits the latest pointer value when dragging ends', () => {
    const handleChangeEnd = vi.fn()
    render(
      <Slider
        aria-label="Ownership"
        defaultValue={0}
        min={0}
        max={100}
        step={1}
        onChangeEnd={handleChangeEnd}
      />
    )

    const slider = screen.getByRole('slider', { name: 'Ownership' })
    stubSliderRect(slider)

    fireEvent.mouseDown(slider, { clientX: 10 })
    fireEvent.mouseMove(window, { clientX: 80 })
    fireEvent.mouseUp(window)

    expect(handleChangeEnd).toHaveBeenLastCalledWith(80)
  })
})
