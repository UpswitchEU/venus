import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MANUAL_LAYOUT_SCROLL_SELECTOR,
  resetScrollLockStateForTests,
  useScrollLock,
} from './useScrollLock'

describe('useScrollLock', () => {
  afterEach(() => {
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.left = ''
    document.body.style.right = ''
    document.body.style.paddingRight = ''
    document.body.style.touchAction = ''
    document.body.style.overscrollBehavior = ''
    document.querySelectorAll('[data-manual-layout-scroll]').forEach((node) => node.remove())
    resetScrollLockStateForTests()
  })

  it('locks body scroll when enabled', () => {
    const { unmount } = renderHook(() => useScrollLock(true))
    expect(document.body.style.position).toBe('fixed')
    expect(document.documentElement.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.position).toBe('')
  })

  it('locks and restores nested manual layout scroll position', () => {
    const container = document.createElement('div')
    container.setAttribute('data-manual-layout-scroll', 'true')
    document.body.appendChild(container)

    let scrollTopValue = 240
    Object.defineProperty(container, 'scrollTop', {
      get() {
        return scrollTopValue
      },
      set(value: number) {
        scrollTopValue = value
      },
      configurable: true,
    })

    const { unmount } = renderHook(() => useScrollLock(true, MANUAL_LAYOUT_SCROLL_SELECTOR))
    expect(container.style.overflow).toBe('hidden')

    unmount()
    expect(container.style.overflow).toBe('')
    expect(scrollTopValue).toBe(240)

    container.remove()
  })

  it('keeps body locked while a second overlay is open', () => {
    const first = renderHook(() => useScrollLock(true))
    const second = renderHook(() => useScrollLock(true))

    expect(document.body.style.position).toBe('fixed')

    second.unmount()
    expect(document.body.style.position).toBe('fixed')

    first.unmount()
    expect(document.body.style.position).toBe('')
  })

  it('locks nested scroll when drawer opens after a modal lock', () => {
    const container = document.createElement('div')
    container.setAttribute('data-manual-layout-scroll', 'true')
    document.body.appendChild(container)

    const modal = renderHook(() => useScrollLock(true))
    expect(container.style.overflow).toBe('')

    const drawer = renderHook(() => useScrollLock(true, MANUAL_LAYOUT_SCROLL_SELECTOR))
    expect(container.style.overflow).toBe('hidden')

    drawer.unmount()
    expect(container.style.overflow).toBe('')
    expect(document.body.style.position).toBe('fixed')

    modal.unmount()
    expect(document.body.style.position).toBe('')

    container.remove()
  })

  it('restores body styles when resetScrollLockStateForTests is called mid-lock', () => {
    const { unmount } = renderHook(() => useScrollLock(true))
    expect(document.body.style.position).toBe('fixed')

    resetScrollLockStateForTests()

    expect(document.body.style.position).toBe('')
    unmount()
  })
})
