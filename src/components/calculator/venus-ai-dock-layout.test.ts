import { describe, expect, it } from 'vitest'
import {
  clampVenusAiDockWidth,
  shouldShowVenusAiDockFab,
  VENUS_AI_DOCK_CONTENT_OFFSET_CLASS,
  VENUS_AI_DOCK_DRAWER_WIDTH_CLASS,
  VENUS_AI_DOCK_LAYER_Z_CLASS,
  venusAiDockContentOffsetClass,
  venusAiDockShellClassName,
} from './venus-ai-dock-layout'

describe('venus-ai-dock-layout', () => {
  it('exports Mercury-matched width and offset tokens', () => {
    expect(VENUS_AI_DOCK_DRAWER_WIDTH_CLASS).toBe('xl:w-[var(--venus-ai-dock-width,420px)]')
    expect(VENUS_AI_DOCK_CONTENT_OFFSET_CLASS).toBe('xl:pr-[var(--venus-ai-dock-width,420px)]')
  })

  it('applies content offset only when the dock is open on desktop', () => {
    expect(venusAiDockContentOffsetClass(true, false)).toBe(VENUS_AI_DOCK_CONTENT_OFFSET_CLASS)
    expect(venusAiDockContentOffsetClass(false, false)).toBeUndefined()
    expect(venusAiDockContentOffsetClass(true, true)).toBeUndefined()
  })

  it('merges shell transition classes with optional base className', () => {
    expect(venusAiDockShellClassName(true, false, 'flex flex-col')).toContain(
      'xl:pr-[var(--venus-ai-dock-width,420px)]'
    )
    expect(venusAiDockShellClassName(true, false, 'flex flex-col')).toContain(
      'transition-[padding]'
    )
    expect(venusAiDockShellClassName(false, false)).not.toContain(
      'xl:pr-[var(--venus-ai-dock-width,420px)]'
    )
  })

  it('uses a dedicated z-index layer above page chrome', () => {
    expect(VENUS_AI_DOCK_LAYER_Z_CLASS).toBe('z-[55]')
  })
})

describe('clampVenusAiDockWidth', () => {
  it('keeps the dock inside its product bounds and leaves the main workspace usable', () => {
    expect(clampVenusAiDockWidth(200, 1440)).toBe(360)
    expect(clampVenusAiDockWidth(900, 1440)).toBe(760)
    expect(clampVenusAiDockWidth(900, 1200)).toBe(680)
  })
})

describe('shouldShowVenusAiDockFab', () => {
  it('shows only when no conflicting modal, route, or open dock', () => {
    expect(shouldShowVenusAiDockFab({})).toBe(true)
    expect(shouldShowVenusAiDockFab({ isAssistantOpen: true })).toBe(false)
    expect(shouldShowVenusAiDockFab({ isStartupAssistantRoute: true })).toBe(false)
    expect(shouldShowVenusAiDockFab({ isFullscreenModalOpen: true })).toBe(false)
    expect(shouldShowVenusAiDockFab({ isBlockingModalOpen: true })).toBe(false)
    expect(shouldShowVenusAiDockFab({ enabled: false })).toBe(false)
  })
})
