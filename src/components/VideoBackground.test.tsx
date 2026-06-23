import { act, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VideoBackground } from './VideoBackground'

const originalInnerWidth = window.innerWidth
const originalMatchMedia = window.matchMedia
const originalPause = HTMLMediaElement.prototype.pause

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  })
}

function installMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia })
  HTMLMediaElement.prototype.pause = originalPause
})

describe('VideoBackground', () => {
  it('uses the static fallback on mobile when mobile video is disabled', async () => {
    setWindowWidth(390)
    installMatchMedia(true)

    const { container } = render(<VideoBackground videos={['/hero.mp4']} />)

    await waitFor(() => expect(container.querySelector('video')).not.toBeInTheDocument())
    expect(container.firstElementChild).toHaveClass('fixed', 'inset-0', '-z-10')
  })

  it('clears a pending transition timeout when unmounted during rotation', () => {
    vi.useFakeTimers()
    setWindowWidth(1200)
    installMatchMedia(false)
    HTMLMediaElement.prototype.pause = vi.fn()

    const { unmount } = render(
      <VideoBackground
        videos={['/first.mp4', '/second.mp4']}
        disableOnMobile={false}
        transitionDuration={50}
        videoDuration={100}
      />
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(vi.getTimerCount()).toBe(2)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
