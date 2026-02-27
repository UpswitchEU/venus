'use client'

/**
 * Hybrid Aurora Design System
 * GlassCard Component
 *
 * A glass-morphism container with physics-based animations
 */

import { HTMLMotionProps, motion } from 'framer-motion'
import { forwardRef } from 'react'
import { cn } from '../utils'
import { springDefault } from './motion'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface GlassCardProps extends HTMLMotionProps<'div'> {
  /** Visual weight of the glass effect */
  variant?: 'default' | 'subtle' | 'strong'
  /** Glow color on hover */
  glow?: 'none' | 'primary' | 'secondary' | 'accent'
  /** Enable hover animations */
  hover?: boolean
  /** Card content */
  children: React.ReactNode
}

// ─────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────

const variantStyles = {
  default: 'bg-card/[0.85] backdrop-blur-xl border border-foreground/[0.08]',
  subtle: 'bg-card/[0.6] backdrop-blur-lg border border-foreground/[0.05]',
  strong: 'bg-card/[0.95] backdrop-blur-2xl border border-foreground/[0.12]',
}

const glowStyles = {
  none: '',
  primary: 'hover:shadow-glow-primary hover:border-primary/20',
  secondary: 'hover:shadow-glow-secondary hover:border-secondary/20',
  accent: 'hover:shadow-glow-accent hover:border-accent/20',
}

// ─────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = 'default', glow = 'none', hover = true, children, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={cn(
          'rounded-xl p-6',
          variantStyles[variant],
          hover && 'transition-all duration-300',
          hover && glowStyles[glow],
          hover && 'hover:translate-y-[-2px]',
          className
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springDefault}
        {...props}
      >
        {children}
      </motion.div>
    )
  }
)

GlassCard.displayName = 'GlassCard'

// ─────────────────────────────────────────
// BENTO CARD VARIANT
// ─────────────────────────────────────────

export interface BentoCardProps extends GlassCardProps {
  /** Column span (responsive grid) */
  colSpan?: 1 | 2 | 3 | 4 | 6 | 12
  /** Row span */
  rowSpan?: 1 | 2 | 3
}

const colSpanClasses = {
  1: 'col-span-12 md:col-span-6 lg:col-span-3',
  2: 'col-span-12 md:col-span-6',
  3: 'col-span-12 md:col-span-6 lg:col-span-4',
  4: 'col-span-12 md:col-span-6 lg:col-span-4',
  6: 'col-span-12 lg:col-span-6',
  12: 'col-span-12',
}

const rowSpanClasses = {
  1: '',
  2: 'row-span-2',
  3: 'row-span-3',
}

export const BentoCard = forwardRef<HTMLDivElement, BentoCardProps>(
  ({ className, colSpan = 1, rowSpan = 1, ...props }, ref) => {
    return (
      <GlassCard
        ref={ref}
        className={cn(colSpanClasses[colSpan], rowSpanClasses[rowSpan], className)}
        {...props}
      />
    )
  }
)

BentoCard.displayName = 'BentoCard'

export default GlassCard
