'use client'

/**
 * Hybrid Aurora Design System
 * Avatar Component
 *
 * Avatar with status indicators, fallback initials, and group stacking.
 */

import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '../utils'

// ─────────────────────────────────────────
// STYLE VARIANTS
// ─────────────────────────────────────────

const avatarVariants = cva(
  [
    'relative inline-flex items-center justify-center',
    'rounded-full',
    'bg-foreground/[0.08] text-foreground/70',
    'font-medium shrink-0',
    'ring-2 ring-background',
  ],
  {
    variants: {
      size: {
        xs: 'w-6 h-6 text-[10px]',
        sm: 'w-8 h-8 text-xs',
        md: 'w-10 h-10 text-sm',
        lg: 'w-12 h-12 text-base',
        xl: 'w-16 h-16 text-lg',
        '2xl': 'w-20 h-20 text-xl',
      },
      variant: {
        default: 'bg-foreground/[0.08]',
        primary: 'bg-primary/20 text-primary',
        secondary: 'bg-secondary/20 text-secondary',
        accent: 'bg-accent/20 text-accent',
        success: 'bg-success/20 text-success',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'default',
    },
  }
)

const statusIndicatorVariants = cva(
  ['absolute rounded-full border-2 border-background z-20', 'translate-x-1/4 translate-y-1/4'],
  {
    variants: {
      size: {
        xs: 'w-2 h-2 bottom-0 right-0',
        sm: 'w-2.5 h-2.5 bottom-0 right-0',
        md: 'w-3 h-3 bottom-0 right-0',
        lg: 'w-3.5 h-3.5 bottom-0 right-0',
        xl: 'w-4 h-4 bottom-0 right-0',
        '2xl': 'w-5 h-5 bottom-0 right-0',
      },
      status: {
        online: 'bg-success',
        offline: 'bg-foreground/30',
        busy: 'bg-destructive',
        away: 'bg-warning',
      },
    },
    defaultVariants: {
      size: 'md',
      status: 'online',
    },
  }
)

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface AvatarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof avatarVariants> {
  /** Image source URL */
  src?: string
  /** Alt text for image */
  alt?: string
  /** Fallback name for initials generation */
  name?: string
  /** Custom fallback content */
  fallback?: React.ReactNode
  /** Status indicator */
  status?: 'online' | 'offline' | 'busy' | 'away'
  /** Show status indicator */
  showStatus?: boolean
}

export interface AvatarGroupProps {
  /** Avatar components to render */
  children: React.ReactNode
  /** Maximum avatars to show before "+X" */
  max?: number
  /** Size of avatars in group */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  /** Spacing between avatars (negative for overlap) */
  spacing?: 'tight' | 'normal' | 'loose'
  /** Container className */
  className?: string
}

// ─────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────

/**
 * Generate initials from a name
 */
const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase()
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// ─────────────────────────────────────────
// AVATAR COMPONENT
// ─────────────────────────────────────────

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      className,
      src,
      alt,
      name,
      fallback,
      size = 'md',
      variant = 'default',
      status,
      showStatus = false,
      ...props
    },
    ref
  ) => {
    const [imageError, setImageError] = React.useState(false)
    const showImage = src && !imageError

    React.useEffect(() => {
      setImageError(false)
    }, [src])

    const renderFallback = () => {
      if (fallback) return fallback
      if (name) return getInitials(name)
      return '?'
    }

    return (
      <div ref={ref} className={cn(avatarVariants({ size, variant }), className)} {...props}>
        {showImage ? (
          <div className="w-full h-full rounded-full overflow-hidden">
            <img
              src={src}
              alt={alt || name || 'Avatar'}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          </div>
        ) : (
          <span className="select-none">{renderFallback()}</span>
        )}

        {showStatus && status && (
          <span
            className={cn(statusIndicatorVariants({ size, status }))}
            aria-label={`Status: ${status}`}
          />
        )}
      </div>
    )
  }
)
Avatar.displayName = 'Avatar'

// ─────────────────────────────────────────
// AVATAR GROUP COMPONENT
// ─────────────────────────────────────────

export const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(
  ({ children, max = 5, size = 'md', spacing = 'normal', className }, ref) => {
    const childArray = React.Children.toArray(children)
    const visibleChildren = childArray.slice(0, max)
    const remainingCount = childArray.length - max

    const spacingClasses = {
      tight: '-space-x-3',
      normal: '-space-x-2',
      loose: '-space-x-1',
    }

    return (
      <div ref={ref} className={cn('flex items-center', spacingClasses[spacing], className)}>
        {visibleChildren.map((child, index) => {
          if (React.isValidElement<AvatarProps>(child)) {
            return React.cloneElement(child, {
              key: index,
              size,
              className: cn(
                child.props.className,
                'hover:z-10 transition-transform hover:scale-110'
              ),
            })
          }
          return child
        })}

        {remainingCount > 0 && (
          <div
            className={cn(
              avatarVariants({ size, variant: 'default' }),
              'bg-foreground/[0.12] hover:z-10'
            )}
          >
            <span className="text-foreground/70 font-medium">+{remainingCount}</span>
          </div>
        )}
      </div>
    )
  }
)
AvatarGroup.displayName = 'AvatarGroup'

// ─────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────

export { Avatar, avatarVariants, statusIndicatorVariants }
