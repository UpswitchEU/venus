'use client'

import type { ReactNode } from 'react'
import { cn } from '@/design-system/utils'

/**
 * Single source of truth for left-panel section step numerals (ManualInput + adaptive sections).
 * Do not duplicate step badges elsewhere — keeps Aurora Teal consistent across methods and business types.
 */

/** Shared layout: step circle + title — use for every manual valuation section header. */
export const SECTION_HEADER_ROW_CLASS = 'flex min-h-8 items-center gap-2'

/**
 * A step token like `5b` / `12c` is a *sub-section* of its numeric parent
 * (`5` / `12`). We auto-downsize the step circle + title in that case so
 * the reading hierarchy (parent → children) shows up at a glance without
 * each call site having to opt in.
 */
function isSubStep(step: string | number | null | undefined): boolean {
  if (step == null) return false
  if (typeof step === 'number') return false
  if (typeof step !== 'string') return false
  return /^\d+[a-z]$/i.test(step.trim())
}

export interface ValuationSectionHeaderProps {
  title: ReactNode
  /** Step index always uses primary (Aurora Teal); `complete` adds ring + stronger fill, not a different hue. */
  step: string | number
  complete?: boolean
  subtitle?: ReactNode
  badge?: ReactNode
  className?: string
  titleAs?: 'h3' | 'span'
  /**
   * Visual tier override. Defaults to auto: numeric step → primary,
   * alphanumeric step (e.g. "5b") → sub. Explicit override is rarely
   * needed — pass it when a sub-step needs a primary treatment or vice
   * versa.
   */
  tier?: 'primary' | 'sub'
}

/** Step indicator: primary tier (default) renders Aurora Teal numerals; sub tier renders smaller, lower-contrast. */
export function SectionStatusCircle({
  step,
  complete,
  className,
  tier = 'primary',
}: {
  step: string | number
  complete: boolean
  className?: string
  tier?: 'primary' | 'sub'
}) {
  const isSub = tier === 'sub'
  return (
    <span
      data-state={complete ? 'complete' : 'incomplete'}
      data-tier={tier}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full tabular-nums font-semibold',
        isSub ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-xs',
        isSub
          ? complete
            ? 'bg-primary/10 text-primary/80 ring-1 ring-inset ring-primary/25'
            : 'bg-foreground/[0.05] text-foreground/55'
          : complete
            ? 'bg-primary/15 text-primary ring-1 ring-inset ring-primary/30'
            : 'bg-primary/10 text-primary',
        className
      )}
      aria-hidden
    >
      {step}
    </span>
  )
}

export function ValuationSectionHeader({
  title,
  step,
  complete = false,
  subtitle,
  badge,
  className,
  titleAs: Title = 'h3',
  tier,
}: ValuationSectionHeaderProps) {
  const resolvedTier: 'primary' | 'sub' = tier ?? (isSubStep(step) ? 'sub' : 'primary')
  const isSub = resolvedTier === 'sub'
  const titleClass = cn(
    isSub ? 'text-[13px] font-medium text-foreground/85' : 'text-sm font-medium text-foreground',
    Title === 'span' && 'inline-flex items-center gap-2'
  )
  // When a subtitle is supplied, stack title + subtitle in a single block so
  // the circle stays vertically centered against the combined block. The
  // header row is `items-center` (via `SECTION_HEADER_ROW_CLASS`), which is
  // the right alignment for the no-subtitle case but would push the circle
  // up off the title's baseline when a subtitle wraps below — `items-start`
  // on the stacked variant keeps the circle pinned to the title row.
  if (subtitle) {
    return (
      <div className={cn('flex flex-wrap items-start gap-2', className)}>
        <SectionStatusCircle
          step={step}
          complete={complete}
          tier={resolvedTier}
          className="mt-0.5 flex"
        />
        <div className="min-w-0 flex-1">
          <Title className={titleClass}>{title}</Title>
          <p className="mt-0.5 text-[11px] leading-snug text-foreground/55">{subtitle}</p>
        </div>
        {badge}
      </div>
    )
  }
  return (
    <div className={cn(SECTION_HEADER_ROW_CLASS, 'flex-wrap', className)}>
      <SectionStatusCircle step={step} complete={complete} tier={resolvedTier} className="flex" />
      <Title className={titleClass}>{title}</Title>
      {badge}
    </div>
  )
}
