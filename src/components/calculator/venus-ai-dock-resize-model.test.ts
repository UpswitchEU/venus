import { describe, expect, it, vi } from 'vitest'
import { VENUS_AI_DOCK_STORAGE_KEY } from './venus-ai-dock-layout'
import {
  readStoredVenusAiDockWidth,
  resolveVenusAiDockKeyboardWidth,
  resolveVenusAiDockPointerWidth,
  writeStoredVenusAiDockWidth,
} from './venus-ai-dock-resize-model'

function makeStorage(initial: Record<string, string | null> = {}) {
  const values = new Map(
    Object.entries(initial).filter(([, value]) => value != null) as [string, string][]
  )
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
  }
}

describe('venus-ai-dock-resize-model', () => {
  it('reads stored widths through the dock constraints', () => {
    const storage = makeStorage({ [VENUS_AI_DOCK_STORAGE_KEY]: '999' })

    expect(readStoredVenusAiDockWidth({ storage, viewportWidth: 1200 })).toBe(680)
    expect(storage.getItem).toHaveBeenCalledWith(VENUS_AI_DOCK_STORAGE_KEY)
  })

  it('falls back to the default width when storage is empty, invalid, or unavailable', () => {
    expect(
      readStoredVenusAiDockWidth({
        storage: makeStorage({ [VENUS_AI_DOCK_STORAGE_KEY]: 'wide' }),
        viewportWidth: 1440,
      })
    ).toBe(420)
    expect(readStoredVenusAiDockWidth({ storage: null, viewportWidth: 1440 })).toBe(420)
  })

  it('reports storage errors without breaking resize preferences', () => {
    const onError = vi.fn()
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked')
      }),
    }

    expect(readStoredVenusAiDockWidth({ onError, storage, viewportWidth: 1440 })).toBe(420)
    writeStoredVenusAiDockWidth(512, { onError, storage })

    expect(onError).toHaveBeenCalledTimes(2)
  })

  it('maps pointer position to a clamped right-dock width', () => {
    expect(resolveVenusAiDockPointerWidth(900, 1440)).toBe(540)
    expect(resolveVenusAiDockPointerWidth(100, 1440)).toBe(760)
    expect(resolveVenusAiDockPointerWidth(Number.NaN, 1440)).toBeNull()
  })

  it('maps keyboard resize commands without leaking DOM details into the hook', () => {
    const viewportWidth = 1440
    expect(
      resolveVenusAiDockKeyboardWidth({ currentWidth: 420, key: 'ArrowLeft', viewportWidth })
    ).toBe(444)
    expect(
      resolveVenusAiDockKeyboardWidth({ currentWidth: 420, key: 'ArrowRight', viewportWidth })
    ).toBe(396)
    expect(resolveVenusAiDockKeyboardWidth({ currentWidth: 420, key: 'Home', viewportWidth })).toBe(
      360
    )
    expect(resolveVenusAiDockKeyboardWidth({ currentWidth: 420, key: 'End', viewportWidth })).toBe(
      760
    )
    expect(
      resolveVenusAiDockKeyboardWidth({ currentWidth: 520, key: 'Enter', viewportWidth })
    ).toBe(420)
    expect(
      resolveVenusAiDockKeyboardWidth({ currentWidth: 520, key: 'x', viewportWidth })
    ).toBeNull()
  })
})
