'use client'

import { Sparkles } from 'lucide-react'
import { cn } from '@/design-system/utils'

/**
 * "Prefilled" badge — surfaces fields auto-derived from the balance sheet,
 * country profile, NACE-sector defaults, accountant prefill, etc. so the
 * user knows the value was *suggested* and can edit it freely.
 *
 * Aurora Clarity treatment: pill with the system's emerald-success token,
 * Lucide Sparkles glyph (the same idiom used for AI-assisted surfaces in
 * the rest of the app), inline-flex so it sits cleanly next to an input or
 * inside a section header.
 */
export function PrefilledBadge({
  label,
  tone = 'success',
  className,
}: {
  label: string
  /**
   * `success` for system/country defaults (emerald).
   * `primary` for accountant prefill (Aurora Teal).
   */
  tone?: 'success' | 'primary'
  className?: string
}) {
  const palette =
    tone === 'primary'
      ? 'bg-primary/10 text-primary ring-primary/20'
      : 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5',
        'text-[10px] font-semibold uppercase tracking-wide',
        'ring-1 ring-inset',
        palette,
        className
      )}
    >
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  )
}
