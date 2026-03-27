'use client'

import type { ReactNode } from 'react'
import { cn } from '@/design-system/utils'

/** Shared layout: step circle + title — use for every manual valuation section header. */
export const SECTION_HEADER_ROW_CLASS = 'flex min-h-8 items-center gap-2'

export interface ValuationSectionHeaderProps {
  title: ReactNode
  /** Step index always shown in the circle; `complete` only changes success vs primary styling. */
  step: string | number
  complete: boolean
  badge?: ReactNode
  className?: string
  titleAs?: 'h3' | 'span'
}

/** Number-only step indicator: success tint when complete, primary when not. */
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
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
        complete ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary',
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
