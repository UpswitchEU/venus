/** Scroll an element into view inside a scroll container without moving the document. */
export function scrollElementIntoContainer(
  element: HTMLElement,
  container: HTMLElement,
  options?: { behavior?: ScrollBehavior; block?: 'start' | 'center' | 'nearest' | 'end' }
): void {
  const behavior = options?.behavior ?? 'smooth'
  const block = options?.block ?? 'start'
  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const relativeTop = elementRect.top - containerRect.top + container.scrollTop

  let targetTop = relativeTop
  if (block === 'center') {
    targetTop = relativeTop - container.clientHeight / 2 + elementRect.height / 2
  } else if (block === 'end') {
    targetTop = relativeTop - container.clientHeight + elementRect.height
  } else if (block === 'nearest') {
    const elementBottom = relativeTop + elementRect.height
    const viewTop = container.scrollTop
    const viewBottom = viewTop + container.clientHeight
    if (relativeTop >= viewTop && elementBottom <= viewBottom) return
    if (relativeTop < viewTop) targetTop = relativeTop
    else targetTop = elementBottom - container.clientHeight
  }

  container.scrollTo({
    top: Math.max(0, targetTop),
    behavior,
  })
}

/** Scroll a container to the bottom without touching document scroll position. */
export function scrollContainerToBottom(container: HTMLElement | null | undefined): void {
  if (!container) return

  const scroll = () => {
    container.scrollTop = container.scrollHeight
  }

  scroll()
  requestAnimationFrame(() => {
    scroll()
    requestAnimationFrame(scroll)
  })
}

function isScrollableElement(el: HTMLElement): boolean {
  if (typeof window === 'undefined') return false
  const style = window.getComputedStyle(el)
  const overflowY = style.overflowY
  const canScroll = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
  return canScroll && el.scrollHeight > el.clientHeight
}

/** Nearest ancestor with overflow scroll/auto that can actually scroll. */
export function findScrollableAncestor(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement
  while (parent) {
    if (isScrollableElement(parent)) return parent
    parent = parent.parentElement
  }
  return null
}

/** True when body scroll lock (`position: fixed`) is active. */
export function isDocumentScrollLocked(): boolean {
  if (typeof document === 'undefined') return false
  return document.body.style.position === 'fixed'
}

/** Scroll within the nearest scroll parent; never touches document scroll when locked. */
export function scrollElementIntoScrollParent(
  element: HTMLElement,
  options?: { behavior?: ScrollBehavior; block?: 'start' | 'center' | 'nearest' | 'end' }
): boolean {
  const scrollParent = findScrollableAncestor(element)
  if (scrollParent) {
    scrollElementIntoContainer(element, scrollParent, options)
    return true
  }

  if (!isDocumentScrollLocked()) {
    // JSDOM (and a handful of older mobile browsers) don't implement
    // scrollIntoView on Element. Treat its absence as "scroll not available"
    // rather than letting a TypeError tear down the React commit — the
    // caller's focus / state work should still proceed.
    if (typeof element.scrollIntoView !== 'function') return false
    element.scrollIntoView({
      behavior: options?.behavior ?? 'smooth',
      block: options?.block ?? 'start',
    })
    return true
  }

  return false
}
