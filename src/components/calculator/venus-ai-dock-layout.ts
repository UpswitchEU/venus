import { cn } from '@/design-system/utils'

export const VENUS_AI_DOCK_DRAWER_WIDTH_CLASS = 'xl:w-[420px]' as const
export const VENUS_AI_DOCK_CONTENT_OFFSET_CLASS = 'xl:pr-[420px]' as const
export const VENUS_AI_DOCK_LAYER_Z_CLASS = 'z-[55]' as const

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
