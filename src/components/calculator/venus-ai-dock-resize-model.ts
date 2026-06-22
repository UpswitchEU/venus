import {
  clampVenusAiDockWidth,
  VENUS_AI_DOCK_DEFAULT_WIDTH,
  VENUS_AI_DOCK_MAX_WIDTH,
  VENUS_AI_DOCK_MIN_WIDTH,
  VENUS_AI_DOCK_STORAGE_KEY,
} from './venus-ai-dock-layout'

interface VenusAiDockWidthStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

interface VenusAiDockWidthStorageOptions {
  onError?: (error: unknown) => void
  storage?: VenusAiDockWidthStorage | null
}

interface ReadStoredVenusAiDockWidthOptions extends VenusAiDockWidthStorageOptions {
  viewportWidth?: number
}

interface ResolveVenusAiDockKeyboardWidthOptions {
  currentWidth: number
  key: string
  viewportWidth?: number
  step?: number
}

function getVenusAiDockWidthStorage(): VenusAiDockWidthStorage | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null
  }
  return window.localStorage
}

export function getVenusAiDockViewportWidth(): number {
  if (typeof window === 'undefined') return 0
  return window.innerWidth || document.documentElement.clientWidth || 0
}

export function resolveVenusAiDockWidth(
  width: number,
  viewportWidth = getVenusAiDockViewportWidth()
): number {
  return clampVenusAiDockWidth(width, viewportWidth)
}

export function readStoredVenusAiDockWidth({
  onError,
  storage = getVenusAiDockWidthStorage(),
  viewportWidth = getVenusAiDockViewportWidth(),
}: ReadStoredVenusAiDockWidthOptions = {}): number {
  if (!storage) {
    return resolveVenusAiDockWidth(VENUS_AI_DOCK_DEFAULT_WIDTH, viewportWidth)
  }
  try {
    const raw = storage.getItem(VENUS_AI_DOCK_STORAGE_KEY)
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
    const width = Number.isFinite(parsed) ? parsed : VENUS_AI_DOCK_DEFAULT_WIDTH
    return resolveVenusAiDockWidth(width, viewportWidth)
  } catch (error) {
    onError?.(error)
    return resolveVenusAiDockWidth(VENUS_AI_DOCK_DEFAULT_WIDTH, viewportWidth)
  }
}

export function writeStoredVenusAiDockWidth(
  width: number,
  { onError, storage = getVenusAiDockWidthStorage() }: VenusAiDockWidthStorageOptions = {}
): void {
  if (!storage) return
  try {
    storage.setItem(VENUS_AI_DOCK_STORAGE_KEY, String(width))
  } catch (error) {
    onError?.(error)
  }
}

export function resolveVenusAiDockPointerWidth(
  clientX: number,
  viewportWidth = getVenusAiDockViewportWidth()
): number | null {
  if (!Number.isFinite(clientX)) return null
  return resolveVenusAiDockWidth(viewportWidth - clientX, viewportWidth)
}

export function resolveVenusAiDockKeyboardWidth({
  currentWidth,
  key,
  step = 24,
  viewportWidth = getVenusAiDockViewportWidth(),
}: ResolveVenusAiDockKeyboardWidthOptions): number | null {
  switch (key) {
    case 'ArrowLeft':
      return resolveVenusAiDockWidth(currentWidth + step, viewportWidth)
    case 'ArrowRight':
      return resolveVenusAiDockWidth(currentWidth - step, viewportWidth)
    case 'Home':
      return resolveVenusAiDockWidth(VENUS_AI_DOCK_MIN_WIDTH, viewportWidth)
    case 'End':
      return resolveVenusAiDockWidth(VENUS_AI_DOCK_MAX_WIDTH, viewportWidth)
    case 'Enter':
    case ' ':
      return resolveVenusAiDockWidth(VENUS_AI_DOCK_DEFAULT_WIDTH, viewportWidth)
    default:
      return null
  }
}
