/**
 * Aurora Design System
 * FormSection Component
 *
 * Wrapper for form sections with Aurora styling.
 * Provides consistent section headers, spacing, and grid layouts.
 */

import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/utils'
import { fadeInUp } from './motion'

interface FormSectionProps {
  title: string
  children: React.ReactNode
  className?: string
  description?: string
  collapsible?: boolean
  defaultOpen?: boolean
  icon?: React.ReactNode
  badge?: React.ReactNode
}

export const AuroraFormSection: React.FC<FormSectionProps> = ({
  title,
  children,
  className,
  description,
  collapsible = false,
  defaultOpen = true,
  icon,
  badge,
}) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className={cn('aurora-theme', className)}
    >
      {/* Section Header */}
      {collapsible ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between gap-3 pb-4 mb-6 border-b border-foreground/[0.06] text-left"
        >
          <div className="flex items-center gap-3">
            {icon && (
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                {icon}
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold text-foreground tracking-tight">
                {title}
                {badge && <span className="ml-2">{badge}</span>}
              </h3>
              {description && <p className="text-sm text-foreground/50 mt-0.5">{description}</p>}
            </div>
          </div>
          <ChevronDown
            className={cn(
              'w-5 h-5 text-foreground/40 transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </button>
      ) : (
        <div className="flex items-center gap-3 pb-4 mb-6 border-b border-foreground/[0.06]">
          {icon && (
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              {icon}
            </div>
          )}
          <div>
            <h3 className="text-lg font-semibold text-foreground tracking-tight">
              {title}
              {badge && <span className="ml-2">{badge}</span>}
            </h3>
            {description && <p className="text-sm text-foreground/50 mt-0.5">{description}</p>}
          </div>
        </div>
      )}

      {/* Section Content */}
      {(!collapsible || isOpen) && (
        <motion.div
          initial={collapsible ? { height: 0, opacity: 0 } : undefined}
          animate={collapsible ? { height: 'auto', opacity: 1 } : undefined}
        >
          {children}
        </motion.div>
      )}
    </motion.div>
  )
}

/**
 * Form Grid Layout
 * Provides responsive grid for form fields
 */
interface FormGridProps {
  children: React.ReactNode
  columns?: 1 | 2 | 3
  className?: string
}

export const AuroraFormGrid: React.FC<FormGridProps> = ({ children, columns = 2, className }) => {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 @4xl:grid-cols-2',
    3: 'grid-cols-1 @2xl:grid-cols-2 @4xl:grid-cols-3',
  }

  return <div className={cn('grid gap-4 sm:gap-6', gridCols[columns], className)}>{children}</div>
}

/**
 * Full Width Field Wrapper
 * For fields that should span full width in grid
 */
interface FullWidthFieldProps {
  children: React.ReactNode
  className?: string
}

export const AuroraFullWidthField: React.FC<FullWidthFieldProps> = ({ children, className }) => {
  return <div className={cn('@4xl:col-span-2', className)}>{children}</div>
}

/**
 * Info Alert for form sections
 * Shows contextual information like auto-filled fields
 */
interface FormAlertProps {
  type?: 'info' | 'success' | 'warning' | 'error'
  icon?: React.ReactNode
  title?: string
  children: React.ReactNode
  className?: string
}

export const AuroraFormAlert: React.FC<FormAlertProps> = ({
  type = 'info',
  icon,
  title,
  children,
  className,
}) => {
  const styles = {
    info: 'bg-primary/5 border-primary/20 text-primary',
    success: 'bg-success/5 border-success/20 text-success',
    warning: 'bg-warning/5 border-warning/20 text-warning',
    error: 'bg-destructive/5 border-destructive/20 text-destructive',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn('p-3 rounded-xl border text-sm', styles[type], className)}
    >
      <div className="flex items-start gap-2">
        {icon && <span className="shrink-0 mt-0.5">{icon}</span>}
        <div>
          {title && <p className="font-medium mb-0.5">{title}</p>}
          <div className="text-foreground/70">{children}</div>
        </div>
      </div>
    </motion.div>
  )
}
