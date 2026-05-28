'use client'

import { useEffect, useId } from 'react'
import { MANUAL_LAYOUT_SCROLL_SELECTOR } from '@/features/manual/utils/manualLayoutScroll'

export { MANUAL_LAYOUT_SCROLL_SELECTOR }

type BodyStyleSnapshot = {
  overflow: string
  position: string
  top: string
  left: string
  right: string
  paddingRight: string
  touchAction: string
  overscrollBehavior: string
}

type ScrollLockSnapshot = {
  scrollY: number
  htmlOverflow: string
  bodyStyles: BodyStyleSnapshot
  nestedScrollEl: HTMLElement | null
  nestedScrollTop: number
  originalNestedOverflow: string | undefined
}

type ScrollLockLayer = {
  nestedScrollSelector?: string
}

const activeLayers = new Map<string, ScrollLockLayer>()
let snapshot: ScrollLockSnapshot | null = null

function getNestedScrollElement(selector?: string): HTMLElement | null {
  if (!selector || typeof document === 'undefined') return null
  const el = document.querySelector(selector)
  return el instanceof HTMLElement ? el : null
}

function getActiveNestedScrollSelector(): string | undefined {
  for (const layer of activeLayers.values()) {
    if (layer.nestedScrollSelector) return layer.nestedScrollSelector
  }
  return undefined
}

function applyBodyScrollLock() {
  if (typeof document === 'undefined') return

  const html = document.documentElement
  const body = document.body
  const scrollY = window.scrollY
  const scrollbarWidth = window.innerWidth - html.clientWidth

  snapshot = {
    scrollY,
    htmlOverflow: html.style.overflow,
    bodyStyles: {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      paddingRight: body.style.paddingRight,
      touchAction: body.style.touchAction,
      overscrollBehavior: body.style.overscrollBehavior,
    },
    nestedScrollEl: null,
    nestedScrollTop: 0,
    originalNestedOverflow: undefined,
  }

  html.style.overflow = 'hidden'
  body.style.overflow = 'hidden'
  body.style.position = 'fixed'
  body.style.top = `-${scrollY}px`
  body.style.left = '0'
  body.style.right = '0'
  body.style.touchAction = 'none'
  body.style.overscrollBehavior = 'none'
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`
  }
}

function syncNestedScrollLock() {
  if (!snapshot) return

  const selector = getActiveNestedScrollSelector()
  const nextNestedEl = getNestedScrollElement(selector)

  if (nextNestedEl === snapshot.nestedScrollEl) {
    if (nextNestedEl) nextNestedEl.style.overflow = 'hidden'
    return
  }

  if (snapshot.nestedScrollEl) {
    snapshot.nestedScrollEl.style.overflow = snapshot.originalNestedOverflow ?? ''
    snapshot.nestedScrollEl.scrollTop = snapshot.nestedScrollTop
  }

  snapshot.nestedScrollEl = nextNestedEl
  snapshot.nestedScrollTop = nextNestedEl?.scrollTop ?? 0
  snapshot.originalNestedOverflow = nextNestedEl?.style.overflow

  if (nextNestedEl) {
    nextNestedEl.style.overflow = 'hidden'
  }
}

function releaseBodyScrollLock() {
  if (!snapshot || typeof document === 'undefined') return

  const html = document.documentElement
  const body = document.body
  const { scrollY, htmlOverflow, bodyStyles, nestedScrollEl, nestedScrollTop, originalNestedOverflow } =
    snapshot

  html.style.overflow = htmlOverflow
  body.style.overflow = bodyStyles.overflow
  body.style.position = bodyStyles.position
  body.style.top = bodyStyles.top
  body.style.left = bodyStyles.left
  body.style.right = bodyStyles.right
  body.style.paddingRight = bodyStyles.paddingRight
  body.style.touchAction = bodyStyles.touchAction
  body.style.overscrollBehavior = bodyStyles.overscrollBehavior

  if (nestedScrollEl) {
    nestedScrollEl.style.overflow = originalNestedOverflow ?? ''
    nestedScrollEl.scrollTop = nestedScrollTop
  }

  snapshot = null

  requestAnimationFrame(() => {
    window.scrollTo(0, scrollY)
  })
}

function acquireScrollLockLayer(layerId: string, nestedScrollSelector?: string) {
  activeLayers.set(layerId, { nestedScrollSelector })

  if (activeLayers.size === 1) {
    applyBodyScrollLock()
  }

  syncNestedScrollLock()
}

function releaseScrollLockLayer(layerId: string) {
  activeLayers.delete(layerId)

  if (activeLayers.size === 0) {
    releaseBodyScrollLock()
    return
  }

  syncNestedScrollLock()
}

/**
 * Robust scroll lock for modals/drawers - works on iOS Safari and Android.
 *
 * Reference-counted so stacked overlays (assistant drawer + normalization modal)
 * do not restore body scroll while another layer is still open.
 */
export function useScrollLock(isLocked: boolean, nestedScrollSelector?: string): void {
  const layerId = useId()

  useEffect(() => {
    if (!isLocked) return

    acquireScrollLockLayer(layerId, nestedScrollSelector)
    return () => releaseScrollLockLayer(layerId)
  }, [isLocked, layerId, nestedScrollSelector])
}

/** Test-only reset for scroll lock module state. */
export function resetScrollLockStateForTests(): void {
  activeLayers.clear()
  if (snapshot) {
    releaseBodyScrollLock()
  }
}
