/**
 * Hybrid Aurora Design System
 * Badge Component
 * 
 * Unified section badges following the neutral pattern
 * to preserve brand accents for primary actions
 */

import { forwardRef } from 'react';
import { cn } from '../utils';

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant */
  variant?: 'neutral' | 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'destructive';
  /** Size preset */
  size?: 'sm' | 'md' | 'lg';
  /** Badge content */
  children: React.ReactNode;
}

// ─────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────

const variantStyles = {
  /** Default: Neutral for section-level badges (recommended) */
  neutral: 'border-foreground/[0.10] bg-foreground/[0.06] text-foreground/80',
  /** Teal: Primary actions, tech-forward */
  primary: 'border-primary/20 bg-primary/10 text-primary',
  /** Clay: CTA emphasis, human warmth */
  secondary: 'border-secondary/20 bg-secondary/10 text-secondary',
  /** Violet: Premium, atmospheric */
  accent: 'border-accent/20 bg-accent/10 text-accent',
  /** Success state */
  success: 'border-success/20 bg-success/10 text-success',
  /** Warning state */
  warning: 'border-warning/20 bg-warning/10 text-warning',
  /** Destructive/error state */
  destructive: 'border-destructive/20 bg-destructive/10 text-destructive',
};

const sizeStyles = {
  sm: 'px-2 py-1 text-[9px] tracking-[0.2em]',
  md: 'px-3 py-1.5 text-[10px] tracking-[0.15em]',
  lg: 'px-4 py-2 text-[11px] tracking-[0.12em]',
};

// ─────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────

export const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'neutral', size = 'md', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex items-center gap-2 rounded-full border font-medium uppercase',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Badge.displayName = 'Badge';

// ─────────────────────────────────────────
// SECTION BADGE (Convenience wrapper)
// ─────────────────────────────────────────

export interface SectionBadgeProps extends Omit<BadgeProps, 'variant'> {
  /** Override to use accent color (use sparingly) */
  accent?: 'primary' | 'secondary' | 'accent';
}

export const SectionBadge = forwardRef<HTMLDivElement, SectionBadgeProps>(
  ({ accent, ...props }, ref) => {
    return <Badge ref={ref} variant={accent || 'neutral'} {...props} />;
  }
);

SectionBadge.displayName = 'SectionBadge';

export default Badge;
