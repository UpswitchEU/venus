import { cn } from '@/design-system/utils'

export const VENUS_AI_DOCK_WIDTH_CSS_VAR = '--venus-ai-dock-width' as const
export const VENUS_AI_DOCK_DEFAULT_WIDTH = 420
export const VENUS_AI_DOCK_MIN_WIDTH = 360
export const VENUS_AI_DOCK_MAX_WIDTH = 760
export const VENUS_AI_DOCK_MIN_MAIN_WIDTH = 520
export const VENUS_AI_DOCK_STORAGE_KEY = 'upswitch:venus-ai-dock-width'
export const VENUS_AI_DOCK_DRAWER_WIDTH_CLASS = 'xl:w-[var(--venus-ai-dock-width,420px)]' as const
export const VENUS_AI_DOCK_CONTENT_OFFSET_CLASS =
  'xl:pr-[var(--venus-ai-dock-width,420px)]' as const
export const VENUS_AI_DOCK_LAYER_Z_CLASS = 'z-[55]' as const

export function clampVenusAiDockWidth(width: number, viewportWidth?: number): number {
  const viewport = viewportWidth ?? 0
  const viewportMax =
    viewport > 0
      ? Math.max(VENUS_AI_DOCK_MIN_WIDTH, viewport - VENUS_AI_DOCK_MIN_MAIN_WIDTH)
      : VENUS_AI_DOCK_MAX_WIDTH
  const maxWidth = Math.min(VENUS_AI_DOCK_MAX_WIDTH, viewportMax)
  return Math.min(maxWidth, Math.max(VENUS_AI_DOCK_MIN_WIDTH, Math.round(width)))
}

/** Apply Mercury-style main padding when the dock is open on desktop (xl+). */
export function venusAiDockContentOffsetClass(
  assistantOpen: boolean,
  isMobile: boolean
): string | undefined {
  return !isMobile && assistantOpen ? VENUS_AI_DOCK_CONTENT_OFFSET_CLASS : undefined
}

export function venusAiDockShellClassName(
  assistantOpen: boolean,
  isMobile: boolean,
  className?: string
): string {
  return cn(
    className,
    'transition-[padding] duration-300 ease-out',
    venusAiDockContentOffsetClass(assistantOpen, isMobile)
  )
}

export type VenusAiDockFabVisibilityInput = {
  enabled?: boolean
  isStartupAssistantRoute?: boolean
  isAssistantOpen?: boolean
  isFullscreenModalOpen?: boolean
  isBlockingModalOpen?: boolean
}

/** FAB only when the dock is off and no higher-priority launcher/modal owns the corner. */
export function shouldShowVenusAiDockFab({
  enabled = true,
  isStartupAssistantRoute = false,
  isAssistantOpen = false,
  isFullscreenModalOpen = false,
  isBlockingModalOpen = false,
}: VenusAiDockFabVisibilityInput): boolean {
  if (!enabled) return false
  if (isAssistantOpen) return false
  if (isStartupAssistantRoute) return false
  if (isFullscreenModalOpen) return false
  if (isBlockingModalOpen) return false
  return true
}
