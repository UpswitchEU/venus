import { scrollElementIntoContainer, scrollElementIntoScrollParent } from '@/utils/scrollContainer'

export { scrollElementIntoContainer } from '@/utils/scrollContainer'
export const MANUAL_LAYOUT_SCROLL_SELECTOR = '[data-manual-layout-scroll]'

export function getManualLayoutScrollContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null

  const candidates = document.querySelectorAll(MANUAL_LAYOUT_SCROLL_SELECTOR)
  for (const node of candidates) {
    if (!(node instanceof HTMLElement)) continue
    const rect = node.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return node
  }

  const fallback = candidates.item(0)
  return fallback instanceof HTMLElement ? fallback : null
}

export function scrollElementIntoManualLayout(
  element: HTMLElement,
  options?: { behavior?: ScrollBehavior; block?: 'start' | 'center' | 'nearest' | 'end' }
): boolean {
  const container = getManualLayoutScrollContainer()
  if (container) {
    scrollElementIntoContainer(element, container, options)
    return true
  }

  return scrollElementIntoScrollParent(element, options)
}

export function scrollAnchorIntoManualLayout(
  anchorId: string,
  options?: { behavior?: ScrollBehavior; block?: 'start' | 'center' | 'nearest' | 'end' }
): boolean {
  if (typeof document === 'undefined') return false
  const element = document.getElementById(anchorId)
  if (!element) return false
  return scrollElementIntoManualLayout(element, options)
}

/** Run after drawer close so body scroll-lock cleanup has committed. */
export function scheduleAfterScrollLockRelease(action: () => void): void {
  if (typeof window === 'undefined') {
    action()
    return
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(action)
  })
}
