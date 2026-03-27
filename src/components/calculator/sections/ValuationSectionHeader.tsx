'use client'

import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/design-system/utils'

export interface ValuationSectionHeaderProps {
  title: ReactNode
  complete: boolean
  stepNumber?: string | number
  badge?: ReactNode
  className?: string
  titleAs?: 'h3' | 'span'
}

/** Inline-friendly (valid inside buttons) — use with a sibling title in accordions. */
export function SectionStatusCircle({
  complete,
  stepNumber,
  className,
}: {
  complete: boolean
  stepNumber?: string | number
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        complete ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary',
        className
      )}
      aria-hidden
    >
      {complete ? (
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
      ) : stepNumber != null ? (
        stepNumber
      ) : (
        <span className="text-[10px]">·</span>
      )}
    </span>
  )
}

/**
 * Matches ManualInputPanel step headers: success + check when complete, primary + step when not.
 */
export function ValuationSectionHeader({
  title,
  complete,
  stepNumber,
  badge,
  className,
  titleAs: Title = 'h3',
}: ValuationSectionHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <SectionStatusCircle complete={complete} stepNumber={stepNumber} className="flex" />
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
