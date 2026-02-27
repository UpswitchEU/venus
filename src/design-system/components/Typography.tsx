/**
 * Typography Component
 *
 * Consistent text hierarchy following the Hybrid Aurora design system.
 * Uses Satoshi for display/body and JetBrains Mono for monospace.
 */

import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '../utils'

const typographyVariants = cva('', {
  variants: {
    variant: {
      // Display - Hero sections, large headlines
      'display-2xl': 'text-display-2xl font-bold tracking-tight',
      'display-xl': 'text-display-xl font-bold tracking-tight',
      'display-lg': 'text-display-lg font-semibold tracking-tight',
      'display-md': 'text-display-md font-semibold tracking-tight',
      'display-sm': 'text-display-sm font-semibold',

      // Headings - Section titles, card headers
      h1: 'text-4xl font-bold tracking-tight',
      h2: 'text-3xl font-bold tracking-tight',
      h3: 'text-2xl font-semibold tracking-tight',
      h4: 'text-xl font-semibold',
      h5: 'text-lg font-semibold',
      h6: 'text-base font-semibold',

      // Body - Paragraphs, descriptions
      'body-lg': 'text-lg leading-relaxed',
      'body-md': 'text-base leading-relaxed',
      'body-sm': 'text-sm leading-relaxed',

      // Caption - Labels, metadata, small text
      caption: 'text-xs leading-normal',

      // Mono - Financial data, code, tabular numbers
      'mono-lg': 'font-mono text-lg tabular-nums',
      'mono-md': 'font-mono text-base tabular-nums',
      'mono-sm': 'font-mono text-sm tabular-nums',
    },
    emphasis: {
      high: 'text-foreground/90',
      medium: 'text-foreground/75',
      low: 'text-foreground/60',
      muted: 'text-foreground/50',
    },
    textColor: {
      default: '',
      primary: 'text-primary',
      secondary: 'text-secondary',
      accent: 'text-accent',
      success: 'text-success',
      warning: 'text-warning',
      destructive: 'text-destructive',
      muted: 'text-muted-foreground',
    },
    align: {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
    },
  },
  defaultVariants: {
    variant: 'body-md',
    emphasis: 'medium',
    textColor: 'default',
    align: 'left',
  },
})

// Map variants to semantic HTML elements
const variantElementMap: Record<string, keyof JSX.IntrinsicElements> = {
  'display-2xl': 'h1',
  'display-xl': 'h1',
  'display-lg': 'h2',
  'display-md': 'h2',
  'display-sm': 'h3',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  'body-lg': 'p',
  'body-md': 'p',
  'body-sm': 'p',
  caption: 'span',
  'mono-lg': 'span',
  'mono-md': 'span',
  'mono-sm': 'span',
}

export interface TypographyProps
  extends React.HTMLAttributes<HTMLElement>,
    Omit<VariantProps<typeof typographyVariants>, 'textColor'> {
  /** Override the semantic HTML element */
  as?: keyof JSX.IntrinsicElements
  /** Text color variant */
  textColor?:
    | 'default'
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'success'
    | 'warning'
    | 'destructive'
    | 'muted'
  /** Apply gradient text effect */
  gradient?: boolean
  /** Apply glow effect (for dark backgrounds) */
  glow?: boolean
}

const Typography = React.forwardRef<HTMLElement, TypographyProps>(
  (
    {
      className,
      variant = 'body-md',
      emphasis,
      textColor,
      align,
      as,
      gradient = false,
      glow = false,
      children,
      ...props
    },
    ref
  ) => {
    const Component = (as || variantElementMap[variant || 'body-md'] || 'p') as React.ElementType

    return (
      <Component
        ref={ref}
        className={cn(
          typographyVariants({ variant, emphasis, textColor, align }),
          gradient &&
            'bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent',
          glow && 'drop-shadow-glow',
          className
        )}
        {...props}
      >
        {children}
      </Component>
    )
  }
)

Typography.displayName = 'Typography'

/* ─────────────────────────────────────────
   Convenience Components
   ───────────────────────────────────────── */

export interface DisplayProps extends Omit<TypographyProps, 'variant'> {
  size?: '2xl' | 'xl' | 'lg' | 'md' | 'sm'
}

const Display = React.forwardRef<HTMLElement, DisplayProps>(({ size = 'xl', ...props }, ref) => (
  <Typography ref={ref} variant={`display-${size}`} emphasis="high" {...props} />
))
Display.displayName = 'Display'

export interface HeadingProps extends Omit<TypographyProps, 'variant'> {
  level?: 1 | 2 | 3 | 4 | 5 | 6
}

const Heading = React.forwardRef<HTMLElement, HeadingProps>(({ level = 2, ...props }, ref) => (
  <Typography ref={ref} variant={`h${level}`} emphasis="high" {...props} />
))
Heading.displayName = 'Heading'

export interface BodyProps extends Omit<TypographyProps, 'variant'> {
  size?: 'lg' | 'md' | 'sm'
}

const Body = React.forwardRef<HTMLElement, BodyProps>(({ size = 'md', ...props }, ref) => (
  <Typography ref={ref} variant={`body-${size}`} {...props} />
))
Body.displayName = 'Body'

const Caption = React.forwardRef<HTMLElement, Omit<TypographyProps, 'variant'>>((props, ref) => (
  <Typography ref={ref} variant="caption" emphasis="low" {...props} />
))
Caption.displayName = 'Caption'

export interface MonoProps extends Omit<TypographyProps, 'variant'> {
  size?: 'lg' | 'md' | 'sm'
}

const Mono = React.forwardRef<HTMLElement, MonoProps>(({ size = 'md', ...props }, ref) => (
  <Typography ref={ref} variant={`mono-${size}`} {...props} />
))
Mono.displayName = 'Mono'

export { Typography, Display, Heading, Body, Caption, Mono, typographyVariants }
