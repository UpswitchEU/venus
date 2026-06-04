import { AnimatePresence, motion } from 'framer-motion'
import React, { useId, useRef, useState } from 'react'
import { cn } from '@/design-system/utils'

interface DropdownProps {
  trigger: React.ReactNode
  children: React.ReactNode
  align?: 'start' | 'center' | 'end'
  variant?: 'default' | 'glass'
  keepOpen?: boolean
  className?: string
  avoidViewportOverflow?: boolean | 'mobile'
}

interface DropdownTriggerProps {
  onClick?: (event: React.MouseEvent) => void
  'aria-expanded'?: boolean
  'aria-controls'?: string
}

interface ViewportPosition {
  left: number
  top: number
  maxHeight: number
  maxWidth: number
}

interface ViewportBounds {
  left: number
  top: number
  width: number
  height: number
  right: number
  bottom: number
}

function readViewportBounds(): ViewportBounds {
  const visualViewport = window.visualViewport
  const hasVisualViewportWidth =
    visualViewport && Number.isFinite(visualViewport.width) && visualViewport.width > 0
  const hasVisualViewportHeight =
    visualViewport && Number.isFinite(visualViewport.height) && visualViewport.height > 0
  const width = hasVisualViewportWidth ? visualViewport.width : window.innerWidth
  const height = hasVisualViewportHeight ? visualViewport.height : window.innerHeight
  const left =
    hasVisualViewportWidth && Number.isFinite(visualViewport.offsetLeft)
      ? visualViewport.offsetLeft
      : 0
  const top =
    hasVisualViewportHeight && Number.isFinite(visualViewport.offsetTop)
      ? visualViewport.offsetTop
      : 0

  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  }
}

function readMobileViewportMode(): boolean {
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(max-width: 767px)').matches
  }

  return window.innerWidth < 768
}

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  children,
  align = 'start',
  variant = 'default',
  keepOpen = false,
  className,
  avoidViewportOverflow = false,
}) => {
  const [open, setOpen] = useState(false)
  const [viewportPosition, setViewportPosition] = useState<ViewportPosition | null>(null)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const shouldAvoidViewportOverflow =
    avoidViewportOverflow === true || (avoidViewportOverflow === 'mobile' && isMobileViewport)

  const syncMobileViewportMode = React.useCallback(() => {
    if (avoidViewportOverflow !== 'mobile') return false

    const matches = readMobileViewportMode()
    setIsMobileViewport((current) => (current === matches ? current : matches))
    return matches
  }, [avoidViewportOverflow])

  const handleTriggerClick = React.useCallback(() => {
    if (!open) {
      if (avoidViewportOverflow === 'mobile') {
        syncMobileViewportMode()
      }
      setViewportPosition(null)
    }
    setOpen((current) => !current)
  }, [avoidViewportOverflow, open, syncMobileViewportMode])

  React.useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent | PointerEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside, true)
    document.addEventListener('mousedown', handleClickOutside, true)
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside, true)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open])

  React.useEffect(() => {
    if (avoidViewportOverflow !== 'mobile') return

    const mediaQuery =
      typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 767px)') : null
    const updateViewportMode = () =>
      setIsMobileViewport(mediaQuery ? mediaQuery.matches : window.innerWidth < 768)

    updateViewportMode()
    if (!mediaQuery) {
      window.addEventListener('resize', updateViewportMode)
      window.addEventListener('orientationchange', updateViewportMode)
      return () => {
        window.removeEventListener('resize', updateViewportMode)
        window.removeEventListener('orientationchange', updateViewportMode)
      }
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateViewportMode)
      return () => mediaQuery.removeEventListener('change', updateViewportMode)
    }

    mediaQuery.addListener(updateViewportMode)
    return () => mediaQuery.removeListener(updateViewportMode)
  }, [avoidViewportOverflow])

  React.useLayoutEffect(() => {
    if (!open || !shouldAvoidViewportOverflow) {
      setViewportPosition(null)
      return
    }

    let frame = 0

    const updatePosition = () => {
      const triggerRect = dropdownRef.current?.getBoundingClientRect()
      const menuElement = menuRef.current
      const menuRect = menuElement?.getBoundingClientRect()
      if (!triggerRect || !menuElement || !menuRect) return

      const padding = 12
      const viewport = readViewportBounds()
      const maxWidth = Math.max(0, viewport.width - padding * 2)
      const measuredMenuWidth = menuElement.offsetWidth || menuRect.width
      const menuWidth = Math.min(measuredMenuWidth, maxWidth)
      const preferredLeft =
        align === 'end'
          ? viewport.left + triggerRect.right - menuWidth
          : align === 'center'
            ? viewport.left + triggerRect.left + triggerRect.width / 2 - menuWidth / 2
            : viewport.left + triggerRect.left
      const minLeft = viewport.left + padding
      const maxLeft = Math.max(minLeft, viewport.right - menuWidth - padding)
      const left = Math.min(Math.max(preferredLeft, minLeft), maxLeft)
      const navRect =
        avoidViewportOverflow === 'mobile'
          ? dropdownRef.current?.closest('nav')?.getBoundingClientRect()
          : null
      const preferredTop = triggerRect.bottom + 8
      const top =
        viewport.top + (navRect ? Math.max(preferredTop, navRect.bottom + 8) : preferredTop)
      const maxHeight = Math.max(0, viewport.bottom - top - padding)

      const nextPosition = {
        left,
        top,
        maxHeight,
        maxWidth,
      }

      setViewportPosition((current) =>
        current &&
        Math.abs(current.left - nextPosition.left) < 0.5 &&
        Math.abs(current.top - nextPosition.top) < 0.5 &&
        Math.abs(current.maxHeight - nextPosition.maxHeight) < 0.5 &&
        Math.abs(current.maxWidth - nextPosition.maxWidth) < 0.5
          ? current
          : nextPosition
      )
    }

    const schedulePositionUpdate = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        updatePosition()
      })
    }

    updatePosition()
    const observedMenuElement = menuRef.current
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && observedMenuElement
        ? new ResizeObserver(schedulePositionUpdate)
        : null

    if (observedMenuElement) {
      resizeObserver?.observe(observedMenuElement)
    }
    const visualViewport = window.visualViewport
    window.addEventListener('resize', schedulePositionUpdate)
    window.addEventListener('scroll', schedulePositionUpdate, true)
    visualViewport?.addEventListener('resize', schedulePositionUpdate)
    visualViewport?.addEventListener('scroll', schedulePositionUpdate)
    window.addEventListener('orientationchange', schedulePositionUpdate)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', schedulePositionUpdate)
      window.removeEventListener('scroll', schedulePositionUpdate, true)
      visualViewport?.removeEventListener('resize', schedulePositionUpdate)
      visualViewport?.removeEventListener('scroll', schedulePositionUpdate)
      window.removeEventListener('orientationchange', schedulePositionUpdate)
    }
  }, [align, avoidViewportOverflow, open, shouldAvoidViewportOverflow])

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      {React.isValidElement(trigger) ? (
        React.cloneElement(trigger as React.ReactElement<DropdownTriggerProps>, {
          onClick: (event: React.MouseEvent) => {
            trigger.props.onClick?.(event)
            if (!event.defaultPrevented) handleTriggerClick()
          },
          'aria-expanded': open,
          'aria-controls': menuId,
        })
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={handleTriggerClick}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              if (!open) {
                if (avoidViewportOverflow === 'mobile') {
                  syncMobileViewportMode()
                }
                setViewportPosition(null)
              }
              setOpen((current) => !current)
            }
          }}
          aria-expanded={open}
          aria-controls={menuId}
        >
          {trigger}
        </div>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            id={menuId}
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 1 }}
            className={cn(
              'z-50 min-w-[200px] rounded-xl border border-foreground/[0.08]',
              shouldAvoidViewportOverflow ? 'fixed' : 'absolute mt-2',
              'backdrop-blur-xl shadow-xl',
              variant === 'glass' ? 'bg-background/80' : 'bg-background/95',
              !shouldAvoidViewportOverflow && align === 'end' && 'right-0',
              !shouldAvoidViewportOverflow && align === 'center' && 'left-1/2 -translate-x-1/2',
              !shouldAvoidViewportOverflow && align === 'start' && 'left-0'
            )}
            style={
              shouldAvoidViewportOverflow
                ? {
                    left: viewportPosition?.left ?? -9999,
                    top: viewportPosition?.top ?? -9999,
                    maxHeight: viewportPosition?.maxHeight,
                    maxWidth: viewportPosition?.maxWidth,
                    overflowY: 'auto',
                    overscrollBehavior: 'contain',
                  }
                : undefined
            }
            onClick={keepOpen ? undefined : () => setOpen(false)}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
