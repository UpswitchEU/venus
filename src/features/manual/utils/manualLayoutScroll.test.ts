import { describe, expect, it, vi } from 'vitest'
import { scrollElementIntoContainer } from '@/utils/scrollContainer'
import {
  scheduleAfterScrollLockRelease,
  scrollAnchorIntoManualLayout,
  scrollElementIntoManualLayout,
} from './manualLayoutScroll'

describe('scrollElementIntoContainer', () => {
  it('scrolls the container without calling scrollIntoView on the element', () => {
    const scrollIntoView = vi.fn()
    const container = document.createElement('div')
    const element = document.createElement('div')
    element.scrollIntoView = scrollIntoView

    let scrollTopValue = 0
    Object.defineProperty(container, 'scrollTop', {
      get() {
        return scrollTopValue
      },
      set(value: number) {
        scrollTopValue = value
      },
      configurable: true,
    })
    Object.defineProperty(container, 'clientHeight', { get: () => 400, configurable: true })
    Object.defineProperty(container, 'scrollHeight', { get: () => 1200, configurable: true })

    container.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: 320,
        bottom: 400,
        width: 320,
        height: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect

    element.getBoundingClientRect = () =>
      ({
        top: 520,
        left: 0,
        right: 320,
        bottom: 560,
        width: 320,
        height: 40,
        x: 0,
        y: 520,
        toJSON: () => ({}),
      }) as DOMRect

    container.scrollTo = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue = top ?? 0
    }) as typeof container.scrollTo

    scrollElementIntoContainer(element, container, { behavior: 'auto', block: 'start' })

    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 520, behavior: 'auto' })
  })
})

describe('scrollAnchorIntoManualLayout', () => {
  it('prefers the visible manual layout scroll container', () => {
    const hidden = document.createElement('div')
    hidden.setAttribute('data-manual-layout-scroll', 'true')
    hidden.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect

    const visible = document.createElement('div')
    visible.setAttribute('data-manual-layout-scroll', 'true')
    const anchor = document.createElement('div')
    anchor.id = 'visible-anchor'
    visible.appendChild(anchor)
    document.body.appendChild(hidden)
    document.body.appendChild(visible)

    visible.scrollTo = vi.fn() as typeof visible.scrollTo
    hidden.scrollTo = vi.fn() as typeof hidden.scrollTo
    visible.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: 320,
        bottom: 400,
        width: 320,
        height: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    anchor.getBoundingClientRect = () =>
      ({
        top: 80,
        left: 0,
        right: 320,
        bottom: 120,
        width: 320,
        height: 40,
        x: 0,
        y: 80,
        toJSON: () => ({}),
      }) as DOMRect
    Object.defineProperty(visible, 'scrollTop', {
      get: () => 0,
      set: () => undefined,
      configurable: true,
    })
    Object.defineProperty(visible, 'clientHeight', { get: () => 400, configurable: true })

    expect(scrollAnchorIntoManualLayout('visible-anchor')).toBe(true)
    expect(visible.scrollTo).toHaveBeenCalled()
    expect(hidden.scrollTo).not.toHaveBeenCalled()

    hidden.remove()
    visible.remove()
  })

  it('uses the manual layout scroll container when present', () => {
    const anchor = document.createElement('div')
    anchor.id = 'startup-step-anchor'

    const container = document.createElement('div')
    container.setAttribute('data-manual-layout-scroll', 'true')
    container.appendChild(anchor)
    document.body.appendChild(container)

    const scrollIntoView = vi.fn()
    anchor.scrollIntoView = scrollIntoView

    container.scrollTo = vi.fn() as typeof container.scrollTo
    container.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: 320,
        bottom: 400,
        width: 320,
        height: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    anchor.getBoundingClientRect = () =>
      ({
        top: 120,
        left: 0,
        right: 320,
        bottom: 160,
        width: 320,
        height: 40,
        x: 0,
        y: 120,
        toJSON: () => ({}),
      }) as DOMRect

    Object.defineProperty(container, 'scrollTop', {
      get: () => 0,
      set: () => undefined,
      configurable: true,
    })
    Object.defineProperty(container, 'clientHeight', { get: () => 400, configurable: true })

    expect(scrollAnchorIntoManualLayout('startup-step-anchor')).toBe(true)
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(container.scrollTo).toHaveBeenCalled()

    container.remove()
  })
})

describe('scrollElementIntoManualLayout', () => {
  it('skips document scroll when body scroll lock is active and no manual layout container exists', () => {
    document.body.style.position = 'fixed'
    const element = document.createElement('div')
    document.body.appendChild(element)

    const scrollIntoView = vi.fn()
    element.scrollIntoView = scrollIntoView

    expect(scrollElementIntoManualLayout(element)).toBe(false)
    expect(scrollIntoView).not.toHaveBeenCalled()

    document.body.style.position = ''
    element.remove()
  })
})

describe('scheduleAfterScrollLockRelease', () => {
  it('runs the action after two animation frames', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })

    const action = vi.fn()
    scheduleAfterScrollLockRelease(action)

    expect(action).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
