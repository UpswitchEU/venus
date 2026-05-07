/**
 * Aurora Design System
 * Button Component
 *
 * Primary/Secondary/Ghost/Outline variants with physics-based animations
 */

import { HTMLMotionProps, motion } from 'framer-motion'
import { forwardRef } from 'react'
import { cn } from '../../lib/utils'
import { hoverLift, springSnappy, tapScale } from './motion'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface AuroraButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  /** Visual variant following 60/30/10 rule */
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive'
  /** Size preset */
  size?: 'sm' | 'md' | 'lg' | 'icon'
  /** Loading state */
  loading?: boolean
  /**
   * Visually hidden text while `loading` (spinner only is shown). Defaults to English “Loading…”.
   * Pass a translated string from `next-intl` (or similar) for non-English locales.
   */
  loadingScreenReaderLabel?: string
  /** Full width */
  fullWidth?: boolean
  /** Button content */
  children: React.ReactNode
}

// ─────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────

const baseStyles = `
  inline-flex items-center justify-center gap-2
  rounded-xl font-medium
  transition-colors duration-200
  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background
  disabled:opacity-50 disabled:pointer-events-none
`

const variantStyles = {
  /** Teal - Primary tech-forward actions */
  primary: `
    bg-primary text-primary-foreground
    hover:bg-primary/90
    focus:ring-primary/50
  `,
  /** Clay - CTAs, human warmth (10% accent - use sparingly) */
  secondary: `
    bg-secondary text-secondary-foreground
    hover:bg-secondary/90
    focus:ring-secondary/50
  `,
  /** Ghost - Low emphasis */
  ghost: `
    bg-transparent text-foreground/75
    hover:bg-foreground/[0.06] hover:text-foreground/90
    focus:ring-foreground/20
  `,
  /** Outline - Medium emphasis */
  outline: `
    bg-transparent text-foreground/80
    border border-foreground/[0.15]
    hover:bg-foreground/[0.06] hover:border-foreground/[0.25]
    focus:ring-foreground/20
  `,
  /** Destructive - Danger actions */
  destructive: `
    bg-destructive text-destructive-foreground
    hover:bg-destructive/90
    focus:ring-destructive/50
  `,
}

const sizeStyles = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
  icon: 'h-10 w-10 p-0',
}

// ─────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────

export const AuroraButton = forwardRef<HTMLButtonElement, AuroraButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      loadingScreenReaderLabel,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <motion.button
        ref={ref}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && 'w-full',
          className
        )}
        disabled={disabled || loading}
        whileHover={!disabled && !loading ? hoverLift : undefined}
        whileTap={!disabled && !loading ? tapScale : undefined}
        transition={springSnappy}
        {...props}
        aria-busy={loading ? true : undefined}
      >
        {loading ? (
          <>
            <LoadingSpinner />
            <span className="sr-only">{loadingScreenReaderLabel ?? 'Loading...'}</span>
          </>
        ) : (
          children
        )}
      </motion.button>
    )
  }
)

AuroraButton.displayName = 'AuroraButton'

// ─────────────────────────────────────────
// LOADING SPINNER
// ─────────────────────────────────────────

const LoadingSpinner = () => (
  <svg
    className="h-4 w-4 animate-spin"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
)

export default AuroraButton
