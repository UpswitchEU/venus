import { PANEL_CONSTRAINTS } from '../constants/panelConstants'

export const PANEL_WIDTH_STORAGE_KEY = 'upswitch-panel-width'

interface PanelWidthStorage {
  getItem: (key: string) => string | null
  removeItem: (key: string) => void
  setItem: (key: string, value: string) => void
}

interface PanelWidthStorageOptions {
  onError?: (error: unknown) => void
  storage?: PanelWidthStorage | null
}

interface ReadStoredPanelWidthOptions extends PanelWidthStorageOptions {
  clearRejectedLegacySplit?: boolean
  rejectLegacyEqualSplit?: boolean
}

function getPanelWidthStorage(): PanelWidthStorage | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null
  }
  return window.localStorage
}

function parseStoredPanelWidth(
  raw: string | null,
  { rejectLegacyEqualSplit = false }: Pick<ReadStoredPanelWidthOptions, 'rejectLegacyEqualSplit'>
): { shouldClear: boolean; width: number | null } {
  if (!raw) return { shouldClear: false, width: null }
  const parsed = Number.parseFloat(raw)
  if (
    !Number.isFinite(parsed) ||
    parsed < PANEL_CONSTRAINTS.MIN_WIDTH ||
    parsed > PANEL_CONSTRAINTS.MAX_WIDTH
  ) {
    return { shouldClear: false, width: null }
  }
  if (rejectLegacyEqualSplit && parsed === 50) {
    return { shouldClear: true, width: null }
  }
  return { shouldClear: false, width: parsed }
}

export function readStoredPanelWidth({
  clearRejectedLegacySplit = false,
  onError,
  rejectLegacyEqualSplit = false,
  storage = getPanelWidthStorage(),
}: ReadStoredPanelWidthOptions = {}): number | null {
  if (!storage) return null
  try {
    const parsed = parseStoredPanelWidth(storage.getItem(PANEL_WIDTH_STORAGE_KEY), {
      rejectLegacyEqualSplit,
    })
    if (parsed.shouldClear && clearRejectedLegacySplit) {
      storage.removeItem(PANEL_WIDTH_STORAGE_KEY)
    }
    return parsed.width
  } catch (error) {
    onError?.(error)
    return null
  }
}

export function writeStoredPanelWidth(
  width: number,
  { onError, storage = getPanelWidthStorage() }: PanelWidthStorageOptions = {}
): void {
  if (!storage) return
  try {
    storage.setItem(PANEL_WIDTH_STORAGE_KEY, String(width))
  } catch (error) {
    onError?.(error)
  }
}

export function clampPanelWidth(width: number): number {
  return Math.max(PANEL_CONSTRAINTS.MIN_WIDTH, Math.min(PANEL_CONSTRAINTS.MAX_WIDTH, width))
}

export function snapPanelWidthToDefault(width: number, tolerance = 2): number {
  return Math.abs(width - PANEL_CONSTRAINTS.DEFAULT_WIDTH) < tolerance
    ? PANEL_CONSTRAINTS.DEFAULT_WIDTH
    : width
}
