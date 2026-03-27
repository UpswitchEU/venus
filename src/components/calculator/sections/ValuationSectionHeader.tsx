'use client'

import type { ReactNode } from 'react'
import { cn } from '@/design-system/utils'

/**
 * Single source of truth for left-panel section step numerals (ManualInput + adaptive sections).
 * Do not duplicate step badges elsewhere — keeps Aurora Teal consistent across methods and business types.
 */

/** Shared layout: step circle + title — use for every manual valuation section header. */
export const SECTION_HEADER_ROW_CLASS = 'flex min-h-8 items-center gap-2'

export interface ValuationSectionHeaderProps {
  title: ReactNode
  /** Step index always uses primary (Aurora Teal); `complete` adds ring + stronger fill, not a different hue. */
  step: string | number
  complete: boolean
  badge?: ReactNode
  className?: string
  titleAs?: 'h3' | 'span'
}

/** Number-only step indicator: always primary numerals; complete state uses inset ring + stronger primary tint. */
export function SectionStatusCircle({
  step,
  complete,
  className,
}: {
  step: string | number
  complete: boolean
  className?: string
}) {
  return (
    <span
      data-state={complete ? 'complete' : 'incomplete'}
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
        complete ? 'bg-primary/15 ring-1 ring-inset ring-primary/30' : 'bg-primary/10',
        className,
        // Last: numeral color must stay primary even if className passes conflicting utilities
        'text-primary'
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
  complete,
  badge,
  className,
  titleAs: Title = 'h3',
}: ValuationSectionHeaderProps) {
  return (
    <div className={cn(SECTION_HEADER_ROW_CLASS, 'flex-wrap', className)}>
      <SectionStatusCircle step={step} complete={complete} className="flex" />
      <Title
        className={cn(
          'text-sm font-medium text-foreground',
          Title === 'span' && 'inline-flex items-center gap-2'
        )}
      >
        {title}
      </Title>
      {badge}
    </div>
  )
}
