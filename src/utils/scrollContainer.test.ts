import { describe, expect, it, vi } from 'vitest'
import { scrollElementIntoScrollParent } from './scrollContainer'

describe('scrollElementIntoScrollParent', () => {
  it('uses a scrollable ancestor instead of scrollIntoView', () => {
    const scrollIntoView = vi.fn()
    const container = document.createElement('div')
    const element = document.createElement('div')
    element.scrollIntoView = scrollIntoView

    Object.defineProperty(container, 'scrollTop', {
      get: () => 0,
      set: () => undefined,
      configurable: true,
    })
    Object.defineProperty(container, 'clientHeight', { get: () => 200, configurable: true })
    Object.defineProperty(container, 'scrollHeight', { get: () => 800, configurable: true })
    container.style.overflowY = 'auto'
    container.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: 200,
        bottom: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    element.getBoundingClientRect = () =>
      ({
        top: 300,
        left: 0,
        right: 200,
        bottom: 340,
        width: 200,
        height: 40,
        x: 0,
        y: 300,
        toJSON: () => ({}),
      }) as DOMRect
    container.scrollTo = vi.fn() as typeof container.scrollTo

    container.appendChild(element)
    document.body.appendChild(container)

    expect(scrollElementIntoScrollParent(element, { behavior: 'auto', block: 'start' })).toBe(true)
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(container.scrollTo).toHaveBeenCalled()

    container.remove()
  })

  it('aligns element bottom to container bottom when block is end', () => {
    const scrollIntoView = vi.fn()
    const container = document.createElement('div')
    const element = document.createElement('div')
    element.scrollIntoView = scrollIntoView

    Object.defineProperty(container, 'scrollTop', {
      get: () => 0,
      set: () => undefined,
      configurable: true,
    })
    Object.defineProperty(container, 'clientHeight', { get: () => 200, configurable: true })
    Object.defineProperty(container, 'scrollHeight', { get: () => 800, configurable: true })
    container.style.overflowY = 'auto'
    container.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: 200,
        bottom: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    element.getBoundingClientRect = () =>
      ({
        top: 100,
        left: 0,
        right: 200,
        bottom: 140,
        width: 200,
        height: 40,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect
    container.scrollTo = vi.fn() as typeof container.scrollTo

    container.appendChild(element)
    document.body.appendChild(container)

    expect(scrollElementIntoScrollParent(element, { behavior: 'auto', block: 'end' })).toBe(true)
    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'auto',
    })

    container.remove()
  })

  it('does not call scrollIntoView when body scroll lock is active and no scroll parent exists', () => {
    document.body.style.position = 'fixed'
    const element = document.createElement('div')
    document.body.appendChild(element)

    const scrollIntoView = vi.fn()
    element.scrollIntoView = scrollIntoView

    expect(scrollElementIntoScrollParent(element)).toBe(false)
    expect(scrollIntoView).not.toHaveBeenCalled()

    document.body.style.position = ''
    element.remove()
  })
})
