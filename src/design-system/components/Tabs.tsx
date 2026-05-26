'use client'

/**
 * Hybrid Aurora Design System
 * Tabs Component
 *
 * Animated tabs with sliding indicator and full keyboard navigation.
 * Built on Radix primitives for accessibility compliance.
 */

import * as TabsPrimitive from '@radix-ui/react-tabs'
import { motion } from 'framer-motion'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../utils'
import { springSnappy } from './motion'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface TabsProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  /** Visual variant */
  variant?: 'underline' | 'pills' | 'enclosed'
  /** Size preset */
  size?: 'sm' | 'md' | 'lg'
}

export interface TabsListProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  /** Visual variant (inherited from Tabs context) */
  variant?: 'underline' | 'pills' | 'enclosed'
  /** Size preset */
  size?: 'sm' | 'md' | 'lg'
}

export interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  /** Icon to display before label */
  icon?: React.ReactNode
}

export interface TabsContentProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> {}

// ─────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────

interface TabsContextValue {
  variant: 'underline' | 'pills' | 'enclosed'
  size: 'sm' | 'md' | 'lg'
  activeRect: DOMRect | null
  setActiveRect: (rect: DOMRect | null) => void
  listRef: React.RefObject<HTMLDivElement>
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

const useTabsContext = () => {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error('Tabs compound components must be used within a Tabs component')
  }
  return context
}

// ─────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────

const listVariantStyles = {
  underline: 'border-b border-foreground/10 bg-transparent',
  pills: 'bg-muted/50 rounded-lg p-1',
  enclosed: 'bg-background border border-foreground/10 rounded-lg p-1',
}

const triggerBaseStyles = `
  relative inline-flex items-center justify-center gap-2
  font-medium transition-colors duration-200
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2
  disabled:pointer-events-none disabled:opacity-50
`

const triggerVariantStyles = {
  underline: {
    inactive: 'text-foreground/60 hover:text-foreground/90',
    active: 'text-primary',
  },
  pills: {
    inactive: 'text-foreground/60 hover:text-foreground/90 rounded-md',
    active: 'text-foreground',
  },
  enclosed: {
    inactive: 'text-foreground/60 hover:text-foreground/90 rounded-md',
    active: 'text-foreground',
  },
}

const triggerSizeStyles = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

// ─────────────────────────────────────────
// TABS ROOT
// ─────────────────────────────────────────

const Tabs = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Root>, TabsProps>(
  ({ className, variant = 'underline', size = 'md', ...props }, ref) => {
    const [activeRect, setActiveRect] = useState<DOMRect | null>(null)
    const listRef = useRef<HTMLDivElement>(null)

    // Memoise the context value so every render of <Tabs> doesn't push a new
    // object into the Provider. Without this, every consumer re-rendered on
    // every parent render, which (combined with the inline callback refs in
    // TabsList/TabsTrigger below) cascaded into Radix `composeRefs` recursion
    // — the React #185 "Maximum update depth exceeded" path the production
    // accountant flow was hitting.
    const contextValue = useMemo(
      () => ({ variant, size, activeRect, setActiveRect, listRef }),
      [variant, size, activeRect]
    )

    return (
      <TabsContext.Provider value={contextValue}>
        <TabsPrimitive.Root ref={ref} className={cn('w-full', className)} {...props} />
      </TabsContext.Provider>
    )
  }
)
Tabs.displayName = 'Tabs'

// ─────────────────────────────────────────
// TABS LIST
// ─────────────────────────────────────────

const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, TabsListProps>(
  ({ className, variant: variantProp, size: sizeProp, ...props }, ref) => {
    void sizeProp
    const context = useTabsContext()
    const variant = variantProp ?? context.variant
    const contextListRef = context.listRef

    // Stable composed-ref so React doesn't detach + reattach this callback on
    // every render. The previous inline arrow created a new identity each
    // commit, and Radix `composeRefs` then recursed through the chain — the
    // root cause of the React #185 in the staging accountant flow.
    const setListRef = useCallback(
      (node: HTMLDivElement | null) => {
        if (typeof ref === 'function') ref(node)
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
        if (contextListRef) {
          ;(contextListRef as React.MutableRefObject<HTMLDivElement | null>).current = node
        }
      },
      [ref, contextListRef]
    )

    return (
      <TabsPrimitive.List
        ref={setListRef}
        className={cn('relative inline-flex items-center', listVariantStyles[variant], className)}
        {...props}
      >
        {/* Animated indicator */}
        {context.activeRect && context.listRef.current && <TabsIndicator variant={variant} />}
        {props.children}
      </TabsPrimitive.List>
    )
  }
)
TabsList.displayName = 'TabsList'

// ─────────────────────────────────────────
// ANIMATED INDICATOR
// ─────────────────────────────────────────

interface TabsIndicatorProps {
  variant: 'underline' | 'pills' | 'enclosed'
}

const TabsIndicator = React.forwardRef<HTMLDivElement, TabsIndicatorProps>(({ variant }, ref) => {
  const { activeRect, listRef } = useTabsContext()

  if (!activeRect || !listRef.current) return null

  const listRect = listRef.current.getBoundingClientRect()
  const left = activeRect.left - listRect.left
  const width = activeRect.width

  if (variant === 'underline') {
    return (
      <motion.div
        ref={ref}
        className="absolute bottom-0 h-0.5 bg-primary rounded-full z-0"
        initial={false}
        animate={{ left, width }}
        transition={springSnappy}
      />
    )
  }

  return (
    <motion.div
      ref={ref}
      className={cn(
        'absolute rounded-md z-0',
        variant === 'pills' && 'bg-background shadow-sm',
        variant === 'enclosed' && 'bg-primary/10'
      )}
      style={{
        height: activeRect.height,
        top: activeRect.top - listRect.top,
      }}
      initial={false}
      animate={{ left, width }}
      transition={springSnappy}
    />
  )
})
TabsIndicator.displayName = 'TabsIndicator'

// ─────────────────────────────────────────
// TABS TRIGGER
// ─────────────────────────────────────────

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, icon, children, ...props }, ref) => {
  const { variant, size, setActiveRect } = useTabsContext()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const checkActive = () => {
      const active = trigger.getAttribute('data-state') === 'active'
      setIsActive(active)
      if (active) {
        setActiveRect(trigger.getBoundingClientRect())
      }
    }

    checkActive()

    const observer = new MutationObserver(checkActive)
    observer.observe(trigger, { attributes: true, attributeFilter: ['data-state'] })

    const resizeObserver = new ResizeObserver(() => {
      if (trigger.getAttribute('data-state') === 'active') {
        setActiveRect(trigger.getBoundingClientRect())
      }
    })
    resizeObserver.observe(trigger)

    return () => {
      observer.disconnect()
      resizeObserver.disconnect()
    }
  }, [setActiveRect])

  // Stable composed-ref. See TabsList comment — inline callback refs created a
  // fresh identity every render, forcing Radix to detach + reattach in commit
  // and recursing through `composeRefs` until React threw #185.
  const setTriggerRef = useCallback(
    (node: HTMLButtonElement | null) => {
      if (typeof ref === 'function') ref(node)
      else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node
      ;(triggerRef as React.MutableRefObject<HTMLButtonElement | null>).current = node
    },
    [ref]
  )

  return (
    <TabsPrimitive.Trigger
      ref={setTriggerRef}
      className={cn(
        triggerBaseStyles,
        triggerSizeStyles[size],
        isActive ? triggerVariantStyles[variant].active : triggerVariantStyles[variant].inactive,
        'z-10',
        className
      )}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </TabsPrimitive.Trigger>
  )
})
TabsTrigger.displayName = 'TabsTrigger'

// ─────────────────────────────────────────
// TABS CONTENT
// ─────────────────────────────────────────

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  TabsContentProps
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-4 ring-offset-background',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2',
      'data-[state=active]:animate-fade-in',
      className
    )}
    {...props}
  />
))
TabsContent.displayName = 'TabsContent'

// ─────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────

export { Tabs, TabsList, TabsTrigger, TabsContent }
export default Tabs
