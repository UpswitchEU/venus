'use client'

/**
 * Segmented Control Component
 *
 * A premium toggle control for mutually exclusive options.
 * Built with accessibility primitives and Framer Motion for fluid animations.
 */

import { motion } from 'framer-motion'
import * as React from 'react'
import { cn } from '@/design-system/utils'
import { springSnappy } from './motion'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface SegmentedControlOption<T extends string = string> {
  value: T
  label: string
  icon?: React.ReactNode
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentedControlOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'ghost' | 'pills'
  fullWidth?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

// ─────────────────────────────────────────
// SIZE CONFIGS
// ─────────────────────────────────────────

const sizeConfig = {
  sm: {
    container: 'h-8 p-0.5 rounded-lg gap-0.5',
    button: 'px-2.5 py-1 text-xs rounded-md gap-1.5',
    icon: 'w-3 h-3',
  },
  md: {
    container: 'h-10 p-1 rounded-xl gap-1',
    button: 'px-3.5 py-1.5 text-sm rounded-lg gap-2',
    icon: 'w-4 h-4',
  },
  lg: {
    container: 'h-12 p-1 rounded-xl gap-1',
    button: 'px-5 py-2 text-sm rounded-lg gap-2',
    icon: 'w-4 h-4',
  },
}

// ─────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  size = 'md',
  variant = 'default',
  fullWidth = false,
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const config = sizeConfig[size]
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [indicatorStyle, setIndicatorStyle] = React.useState<{
    left: number
    width: number
  } | null>(null)
  const instanceId = React.useId()

  const updateIndicator = React.useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const selectedIndex = options.findIndex((opt) => opt.value === value)
    const buttons = container.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    const selectedButton = buttons[selectedIndex]

    if (selectedButton) {
      const containerRect = container.getBoundingClientRect()
      const buttonRect = selectedButton.getBoundingClientRect()
      setIndicatorStyle({
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
      })
    }
  }, [value, options])

  // Measure synchronously after DOM commits (replaces a deferred setTimeout)
  // so the pill aligns on the first paint.
  React.useLayoutEffect(() => {
    updateIndicator()
  }, [updateIndicator])

  React.useEffect(() => {
    const handleResize = () => updateIndicator()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [updateIndicator])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const enabledOptions = options.filter((opt) => !opt.disabled)
    const currentEnabledIndex = enabledOptions.findIndex((opt) => opt.value === value)

    let nextIndex = currentEnabledIndex

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      nextIndex = (currentEnabledIndex + 1) % enabledOptions.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      nextIndex = (currentEnabledIndex - 1 + enabledOptions.length) % enabledOptions.length
    }

    if (nextIndex !== currentEnabledIndex) {
      onChange(enabledOptions[nextIndex].value)
    }
  }

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'relative inline-flex items-center',
        config.container,
        variant === 'default' && 'bg-foreground/[0.05] border border-foreground/[0.08]',
        variant === 'ghost' && 'bg-transparent',
        variant === 'pills' && 'bg-foreground/[0.03] border border-foreground/[0.05]',
        fullWidth && 'w-full',
        disabled && 'opacity-50 pointer-events-none',
        className
      )}
    >
      {/* Sliding Indicator */}
      {variant !== 'ghost' && indicatorStyle && indicatorStyle.width > 0 && (
        <motion.div
          key={`indicator-${instanceId}`}
          className={cn(
            'absolute z-0',
            size === 'sm' && 'rounded-md',
            size === 'md' && 'rounded-lg',
            size === 'lg' && 'rounded-lg',
            variant === 'default' && 'bg-foreground/[0.10] shadow-sm',
            variant === 'pills' &&
              'bg-primary/20 border border-primary/30 shadow-sm shadow-primary/10'
          )}
          initial={false}
          animate={{
            x: indicatorStyle.left,
            width: indicatorStyle.width,
          }}
          transition={springSnappy}
          style={{
            top: size === 'sm' ? 2 : 4,
            bottom: size === 'sm' ? 2 : 4,
            left: 0,
          }}
        />
      )}

      {/* Options */}
      {options.map((option) => {
        const isSelected = option.value === value
        const isDisabled = disabled || option.disabled

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={isDisabled}
            onClick={() => !isDisabled && onChange(option.value)}
            onKeyDown={handleKeyDown}
            tabIndex={isSelected ? 0 : -1}
            className={cn(
              'relative z-10 flex items-center justify-center font-medium',
              'transition-colors duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1',
              config.button,
              fullWidth && 'flex-1',
              isSelected ? 'text-foreground' : 'text-foreground/50 hover:text-foreground/70',
              isDisabled && 'cursor-not-allowed opacity-50'
            )}
          >
            {option.icon && <span className={cn(config.icon, 'flex-shrink-0')}>{option.icon}</span>}
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

SegmentedControl.displayName = 'SegmentedControl'

export default SegmentedControl
