import { describe, expect, it, vi } from 'vitest'
import { scrollMessagesContainerToBottom } from './ChatAssistantDrawer.utils'

describe('scrollMessagesContainerToBottom', () => {
  it('sets scrollTop to scrollHeight immediately and after layout frames', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })

    const container = document.createElement('div')
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
    Object.defineProperty(container, 'scrollHeight', {
      get() {
        return 640
      },
      configurable: true,
    })

    scrollMessagesContainerToBottom(container, { force: true })

    expect(scrollTopValue).toBe(640)

    vi.unstubAllGlobals()
  })

  it('does not pull the user to the bottom when they are reading older messages', () => {
    const container = document.createElement('div')
    let scrollTopValue = 100
    Object.defineProperty(container, 'scrollTop', {
      get() {
        return scrollTopValue
      },
      set(value: number) {
        scrollTopValue = value
      },
      configurable: true,
    })
    Object.defineProperty(container, 'scrollHeight', {
      get() {
        return 1000
      },
      configurable: true,
    })
    Object.defineProperty(container, 'clientHeight', {
      get() {
        return 300
      },
      configurable: true,
    })

    scrollMessagesContainerToBottom(container)

    expect(scrollTopValue).toBe(100)
  })

  it('follows new content while the user is already near the bottom', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })

    const container = document.createElement('div')
    let scrollTopValue = 620
    Object.defineProperty(container, 'scrollTop', {
      get() {
        return scrollTopValue
      },
      set(value: number) {
        scrollTopValue = value
      },
      configurable: true,
    })
    Object.defineProperty(container, 'scrollHeight', {
      get() {
        return 1000
      },
      configurable: true,
    })
    Object.defineProperty(container, 'clientHeight', {
      get() {
        return 300
      },
      configurable: true,
    })

    scrollMessagesContainerToBottom(container)

    expect(scrollTopValue).toBe(1000)
    vi.unstubAllGlobals()
  })

  it('no-ops when container is missing', () => {
    expect(() => scrollMessagesContainerToBottom(null)).not.toThrow()
    expect(() => scrollMessagesContainerToBottom(undefined)).not.toThrow()
  })
})
