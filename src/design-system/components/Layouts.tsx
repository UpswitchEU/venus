/**
 * Aurora Design System
 * Layout Components
 * 
 * Split panel layouts for the valuation flows.
 * Provides resizable panels with Aurora styling.
 */

import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'
import { springDefault } from './motion'

// ─────────────────────────────────────────
// SPLIT LAYOUT (Two Panels)
// ─────────────────────────────────────────

interface AuroraSplitLayoutProps {
  leftPanel: React.ReactNode
  rightPanel: React.ReactNode
  defaultLeftWidth?: number // Percentage (0-100)
  minLeftWidth?: number
  maxLeftWidth?: number
  className?: string
  leftClassName?: string
  rightClassName?: string
  dividerClassName?: string
  resizable?: boolean
}

export const AuroraSplitLayout: React.FC<AuroraSplitLayoutProps> = ({
  leftPanel,
  rightPanel,
  defaultLeftWidth = 50,
  minLeftWidth = 25,
  maxLeftWidth = 75,
  className,
  leftClassName,
  rightClassName,
  dividerClassName,
  resizable = true,
}) => {
  const [leftWidth, setLeftWidth] = React.useState(defaultLeftWidth)
  const [isResizing, setIsResizing] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const handleMouseDown = React.useCallback(() => {
    setIsResizing(true)
  }, [])

  React.useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      
      const containerRect = containerRef.current.getBoundingClientRect()
      const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100
      
      setLeftWidth(Math.max(minLeftWidth, Math.min(maxLeftWidth, newLeftWidth)))
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, minLeftWidth, maxLeftWidth])

  return (
    <div
      ref={containerRef}
      className={cn(
        'aurora-theme flex h-full w-full overflow-hidden bg-background',
        isResizing && 'select-none cursor-col-resize',
        className
      )}
    >
      {/* Left Panel */}
      <div
        className={cn('h-full overflow-hidden', leftClassName)}
        style={{ width: `${leftWidth}%` }}
      >
        {leftPanel}
      </div>

      {/* Resizable Divider */}
      {resizable && (
        <div
          className={cn(
            'relative w-1 h-full cursor-col-resize flex-shrink-0',
            'bg-foreground/[0.04] hover:bg-primary/20 transition-colors',
            isResizing && 'bg-primary/30',
            dividerClassName
          )}
          onMouseDown={handleMouseDown}
        >
          {/* Visible divider line */}
          <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/[0.08]" />
          
          {/* Drag handle indicator */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="w-1 h-8 rounded-full bg-foreground/20 hover:bg-foreground/30 transition-colors" />
          </div>
        </div>
      )}

      {/* Right Panel */}
      <div
        className={cn('h-full flex-1 overflow-hidden', rightClassName)}
      >
        {rightPanel}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// PAGE CONTAINER
// ─────────────────────────────────────────

interface AuroraPageContainerProps {
  children: React.ReactNode
  className?: string
  header?: React.ReactNode
  footer?: React.ReactNode
}

export const AuroraPageContainer: React.FC<AuroraPageContainerProps> = ({
  children,
  className,
  header,
  footer,
}) => {
  return (
    <div className={cn('aurora-theme flex flex-col h-screen w-full bg-background', className)}>
      {/* Header */}
      {header && <div className="shrink-0">{header}</div>}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">{children}</div>

      {/* Footer */}
      {footer && <div className="shrink-0">{footer}</div>}
    </div>
  )
}

// ─────────────────────────────────────────
// PANEL CONTAINER
// ─────────────────────────────────────────

interface AuroraPanelProps {
  children: React.ReactNode
  className?: string
  header?: React.ReactNode
  footer?: React.ReactNode
  scrollable?: boolean
}

export const AuroraPanel: React.FC<AuroraPanelProps> = ({
  children,
  className,
  header,
  footer,
  scrollable = true,
}) => {
  return (
    <div className={cn('aurora-theme flex flex-col h-full bg-card', className)}>
      {/* Panel Header */}
      {header && (
        <div className="shrink-0 border-b border-foreground/[0.06]">{header}</div>
      )}

      {/* Panel Content */}
      <div
        className={cn(
          'flex-1 min-h-0',
          scrollable ? 'overflow-y-auto' : 'overflow-hidden'
        )}
      >
        {children}
      </div>

      {/* Panel Footer */}
      {footer && (
        <div className="shrink-0 border-t border-foreground/[0.06]">{footer}</div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// SCROLLABLE AREA
// ─────────────────────────────────────────

interface AuroraScrollAreaProps {
  children: React.ReactNode
  className?: string
  padding?: boolean
}

export const AuroraScrollArea: React.FC<AuroraScrollAreaProps> = ({
  children,
  className,
  padding = true,
}) => {
  return (
    <div
      className={cn(
        'h-full overflow-y-auto scrollbar-thin scrollbar-thumb-foreground/10 scrollbar-track-transparent',
        padding && 'p-4 sm:p-6',
        className
      )}
    >
      {children}
    </div>
  )
}

// ─────────────────────────────────────────
// CARD CONTAINER
// ─────────────────────────────────────────

interface AuroraCardProps {
  children: React.ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  variant?: 'default' | 'elevated' | 'bordered'
}

export const AuroraCard: React.FC<AuroraCardProps> = ({
  children,
  className,
  padding = 'md',
  variant = 'default',
}) => {
  const paddingStyles = {
    none: '',
    sm: 'p-3',
    md: 'p-4 sm:p-6',
    lg: 'p-6 sm:p-8',
  }

  const variantStyles = {
    default: 'bg-card',
    elevated: 'bg-card shadow-mercury',
    bordered: 'bg-card border border-foreground/[0.08]',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springDefault}
      className={cn(
        'aurora-theme rounded-xl',
        paddingStyles[padding],
        variantStyles[variant],
        className
      )}
    >
      {children}
    </motion.div>
  )
}
