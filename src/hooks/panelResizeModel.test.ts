import { describe, expect, it, vi } from 'vitest'
import { PANEL_CONSTRAINTS } from '../constants/panelConstants'
import {
  clampPanelWidth,
  PANEL_WIDTH_STORAGE_KEY,
  readStoredPanelWidth,
  snapPanelWidthToDefault,
  writeStoredPanelWidth,
} from './panelResizeModel'

function createMemoryStorage(initialValue: string | null = null) {
  let value = initialValue
  return {
    getItem: vi.fn(() => value),
    removeItem: vi.fn(() => {
      value = null
    }),
    setItem: vi.fn((_key: string, nextValue: string) => {
      value = nextValue
    }),
  }
}

describe('panelResizeModel', () => {
  it('reads valid stored panel widths and rejects invalid values', () => {
    expect(readStoredPanelWidth({ storage: createMemoryStorage('42') })).toBe(42)
    expect(readStoredPanelWidth({ storage: createMemoryStorage('not-a-number') })).toBeNull()
    expect(readStoredPanelWidth({ storage: createMemoryStorage('19') })).toBeNull()
    expect(readStoredPanelWidth({ storage: createMemoryStorage('51') })).toBeNull()
  })

  it('clears legacy equal-split panel width when requested', () => {
    const storage = createMemoryStorage('50')

    expect(
      readStoredPanelWidth({
        clearRejectedLegacySplit: true,
        rejectLegacyEqualSplit: true,
        storage,
      })
    ).toBeNull()
    expect(storage.removeItem).toHaveBeenCalledWith(PANEL_WIDTH_STORAGE_KEY)
  })

  it('keeps storage failures non-fatal', () => {
    const onError = vi.fn()
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('locked')
      }),
      removeItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new Error('quota')
      }),
    }

    expect(readStoredPanelWidth({ onError, storage })).toBeNull()
    writeStoredPanelWidth(33, { onError, storage })

    expect(onError).toHaveBeenCalledTimes(2)
  })

  it('clamps and snaps panel widths consistently', () => {
    expect(clampPanelWidth(5)).toBe(PANEL_CONSTRAINTS.MIN_WIDTH)
    expect(clampPanelWidth(70)).toBe(PANEL_CONSTRAINTS.MAX_WIDTH)
    expect(clampPanelWidth(35)).toBe(35)
    expect(snapPanelWidthToDefault(PANEL_CONSTRAINTS.DEFAULT_WIDTH + 1)).toBe(
      PANEL_CONSTRAINTS.DEFAULT_WIDTH
    )
    expect(snapPanelWidthToDefault(PANEL_CONSTRAINTS.DEFAULT_WIDTH + 3)).toBe(
      PANEL_CONSTRAINTS.DEFAULT_WIDTH + 3
    )
  })
})
