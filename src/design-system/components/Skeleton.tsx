'use client'

/**
 * Skeleton Component
 *
 * Loading placeholders with shimmer animations following the Hybrid Aurora design system.
 * Provides various preset shapes and composable primitives for building loading states.
 */

import { cva, type VariantProps } from 'class-variance-authority'
import { motion } from 'framer-motion'
import { cn } from '../utils'

/* ─────────────────────────────────────────
   SKELETON VARIANTS
   ───────────────────────────────────────── */

const skeletonVariants = cva('relative overflow-hidden bg-foreground/10 isolate', {
  variants: {
    variant: {
      default: 'rounded-md',
      circular: 'rounded-full',
      rounded: 'rounded-xl',
      text: 'rounded h-4',
      card: 'rounded-2xl',
    },
    animation: {
      shimmer: '',
      pulse: 'animate-pulse',
      wave: '',
      none: '',
    },
  },
  defaultVariants: {
    variant: 'default',
    animation: 'shimmer',
  },
})

/* ─────────────────────────────────────────
   SHIMMER OVERLAY
   ───────────────────────────────────────── */

const ShimmerOverlay = () => (
  <motion.div
    className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/5 to-transparent"
    animate={{
      translateX: ['-100%', '100%'],
    }}
    transition={{
      duration: 1.5,
      repeat: Infinity,
      ease: 'linear',
    }}
  />
)

const WaveOverlay = () => (
  <motion.div
    className="absolute inset-0"
    style={{
      background:
        'linear-gradient(90deg, transparent 0%, hsl(var(--foreground) / 0.08) 50%, transparent 100%)',
    }}
    animate={{
      x: ['-100%', '100%'],
      opacity: [0.5, 0.8, 0.5],
    }}
    transition={{
      x: {
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      },
      opacity: {
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    }}
  />
)

/* ─────────────────────────────────────────
   BASE SKELETON
   ───────────────────────────────────────── */

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {
  /** Width of the skeleton */
  width?: string | number
  /** Height of the skeleton */
  height?: string | number
}

export function Skeleton({
  className,
  variant,
  animation = 'shimmer',
  width,
  height,
  style,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(skeletonVariants({ variant, animation }), className)}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
      {...props}
    >
      {animation === 'shimmer' && <ShimmerOverlay />}
      {animation === 'wave' && <WaveOverlay />}
    </div>
  )
}

/* ─────────────────────────────────────────
   SKELETON TEXT
   ───────────────────────────────────────── */

export interface SkeletonTextProps extends Omit<SkeletonProps, 'variant'> {
  /** Number of lines to render */
  lines?: number
  /** Width of the last line (percentage or value) */
  lastLineWidth?: string | number
  /** Gap between lines */
  gap?: 'sm' | 'md' | 'lg'
}

const gapClasses = {
  sm: 'gap-1.5',
  md: 'gap-2',
  lg: 'gap-3',
}

export function SkeletonText({
  lines = 3,
  lastLineWidth = '60%',
  gap = 'md',
  className,
  animation,
  ...props
}: SkeletonTextProps) {
  return (
    <div className={cn('flex flex-col', gapClasses[gap], className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          animation={animation}
          width={i === lines - 1 ? lastLineWidth : '100%'}
          {...props}
        />
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────
   SKELETON AVATAR
   ───────────────────────────────────────── */

export interface SkeletonAvatarProps extends Omit<SkeletonProps, 'variant' | 'width' | 'height'> {
  /** Size of the avatar */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
}

const avatarSizes = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 56,
  '2xl': 64,
}

export function SkeletonAvatar({ size = 'md', className, ...props }: SkeletonAvatarProps) {
  const dimension = avatarSizes[size]
  return (
    <Skeleton
      variant="circular"
      width={dimension}
      height={dimension}
      className={className}
      {...props}
    />
  )
}

/* ─────────────────────────────────────────
   SKELETON BUTTON
   ───────────────────────────────────────── */

export interface SkeletonButtonProps extends Omit<SkeletonProps, 'variant' | 'height'> {
  /** Size of the button */
  size?: 'sm' | 'md' | 'lg'
}

const buttonSizes = {
  sm: { height: 32, width: 80 },
  md: { height: 40, width: 100 },
  lg: { height: 48, width: 120 },
}

export function SkeletonButton({ size = 'md', width, className, ...props }: SkeletonButtonProps) {
  return (
    <Skeleton
      variant="rounded"
      width={width ?? buttonSizes[size].width}
      height={buttonSizes[size].height}
      className={className}
      {...props}
    />
  )
}

/* ─────────────────────────────────────────
   SKELETON CARD
   ───────────────────────────────────────── */

export interface SkeletonCardProps extends Omit<SkeletonProps, 'variant'> {
  /** Show header section */
  showHeader?: boolean
  /** Show avatar in header */
  showAvatar?: boolean
  /** Number of content lines */
  contentLines?: number
  /** Show footer/action area */
  showFooter?: boolean
}

export function SkeletonCard({
  showHeader = true,
  showAvatar = true,
  contentLines = 3,
  showFooter = false,
  className,
  animation,
  ...props
}: SkeletonCardProps) {
  return (
    <div
      className={cn('p-6 rounded-2xl bg-card/50 border border-border/50 space-y-4', className)}
      {...props}
    >
      {showHeader && (
        <div className="flex items-center gap-3">
          {showAvatar && <SkeletonAvatar size="md" animation={animation} />}
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" width="40%" animation={animation} />
            <Skeleton variant="text" width="25%" height={12} animation={animation} />
          </div>
        </div>
      )}

      <SkeletonText lines={contentLines} animation={animation} />

      {showFooter && (
        <div className="flex gap-2 pt-2">
          <SkeletonButton size="sm" animation={animation} />
          <SkeletonButton size="sm" width={60} animation={animation} />
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────
   SKELETON IMAGE
   ───────────────────────────────────────── */

export interface SkeletonImageProps extends Omit<SkeletonProps, 'variant'> {
  /** Aspect ratio preset */
  aspectRatio?: 'square' | 'video' | 'portrait' | 'landscape'
}

const aspectRatioClasses = {
  square: 'aspect-square',
  video: 'aspect-video',
  portrait: 'aspect-[3/4]',
  landscape: 'aspect-[4/3]',
}

export function SkeletonImage({ aspectRatio = 'video', className, ...props }: SkeletonImageProps) {
  return (
    <Skeleton
      variant="rounded"
      className={cn(aspectRatioClasses[aspectRatio], 'w-full', className)}
      {...props}
    />
  )
}

/* ─────────────────────────────────────────
   SKELETON TABLE
   ───────────────────────────────────────── */

export interface SkeletonTableProps extends Omit<SkeletonProps, 'variant' | 'width' | 'height'> {
  /** Number of rows */
  rows?: number
  /** Number of columns */
  columns?: number
  /** Show header row */
  showHeader?: boolean
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
  showHeader = true,
  className,
  animation,
  ...props
}: SkeletonTableProps) {
  return (
    <div className={cn('w-full space-y-3', className)} {...props}>
      {showHeader && (
        <div className="flex gap-4 pb-2 border-b border-border/30">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton
              key={`header-${i}`}
              variant="text"
              width={`${100 / columns}%`}
              height={12}
              animation={animation}
            />
          ))}
        </div>
      )}

      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={`row-${rowIndex}`} className="flex gap-4 items-center">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={`cell-${rowIndex}-${colIndex}`}
              variant="text"
              width={`${100 / columns}%`}
              animation={animation}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────
   SKELETON LIST
   ───────────────────────────────────────── */

export interface SkeletonListProps extends Omit<SkeletonProps, 'variant' | 'width' | 'height'> {
  /** Number of items */
  items?: number
  /** Show avatar/icon area */
  showIcon?: boolean
  /** Show secondary text */
  showSecondary?: boolean
}

export function SkeletonList({
  items = 4,
  showIcon = true,
  showSecondary = true,
  className,
  animation,
  ...props
}: SkeletonListProps) {
  const primaryWidths = ['82%', '70%', '88%', '76%']
  const secondaryWidths = ['52%', '44%', '58%', '48%']

  return (
    <div className={cn('space-y-4', className)} {...props}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          {showIcon && <SkeletonAvatar size="sm" animation={animation} />}
          <div className="flex-1 space-y-1.5">
            <Skeleton
              variant="text"
              width={primaryWidths[i % primaryWidths.length]}
              animation={animation}
            />
            {showSecondary && (
              <Skeleton
                variant="text"
                width={secondaryWidths[i % secondaryWidths.length]}
                height={12}
                animation={animation}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────
   SKELETON FORM
   ───────────────────────────────────────── */

export interface SkeletonFormProps extends Omit<SkeletonProps, 'variant' | 'width' | 'height'> {
  /** Number of fields */
  fields?: number
  /** Show submit button */
  showButton?: boolean
}

export function SkeletonForm({
  fields = 3,
  showButton = true,
  className,
  animation,
  ...props
}: SkeletonFormProps) {
  return (
    <div className={cn('space-y-6', className)} {...props}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton variant="text" width={80} height={12} animation={animation} />
          <Skeleton variant="rounded" height={48} animation={animation} />
        </div>
      ))}

      {showButton && <SkeletonButton size="lg" width="100%" animation={animation} />}
    </div>
  )
}

/* ─────────────────────────────────────────
   EXPORTS
   ───────────────────────────────────────── */

export type { VariantProps }
