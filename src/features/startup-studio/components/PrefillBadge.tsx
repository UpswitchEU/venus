'use client'

/**
 * PrefillBadge
 * ------------
 *
 * Tiny inline chip that signals where a value came from. The Studio
 * pre-fills aggressively (sector default Y5, sector benchmark exit
 * multiple, stage default ROI + raise, Mercury URL prefill) so the
 * founder lands on a populated panel — but the audit found that this
 * silent pre-fill made it hard to tell what was a sector default vs
 * what they'd typed. Without this badge a defensible-by-default
 * panel reads as a confident-but-opaque panel.
 *
 * Variants:
 *   - "sector_default"     — value comes from the sector lookup
 *     (e.g. STARTUP_SECTOR_DEFAULT_Y5_REVENUE)
 *   - "stage_default"      — value comes from the stage lookup
 *     (e.g. STARTUP_STAGE_DEFAULT_RAISE)
 *   - "benchmark_default"  — value comes from a regional benchmark
 *     median (Athena, Atomico/Dealroom)
 *   - "mercury"            — value was supplied via the Mercury →
 *     Venus deep-link URL params (CompanyCardStep first-mount effect)
 *   - "your_override"      — value differs from any default; useful
 *     when a previous step pre-filled and the user has since edited
 *
 * Render strategy: the badge is purely decorative — value rendering
 * itself stays in the input; this strip mounts BELOW the input so
 * it never competes with the value visually. Auto-hides when no
 * variant is supplied so consumers can drop it in unconditionally.
 */

import { useTranslations } from 'next-intl'
import { Sparkles, User2 } from 'lucide-react'

export type PrefillVariant =
  | 'sector_default'
  | 'stage_default'
  | 'benchmark_default'
  | 'mercury'
  | 'your_override'
  | null
  | undefined

interface PrefillBadgeProps {
  variant: PrefillVariant
  /** Optional className for the wrapper. */
  className?: string
}

const VARIANT_KEY: Record<NonNullable<PrefillVariant>, string> = {
  sector_default: 'sectorDefault',
  stage_default: 'stageDefault',
  benchmark_default: 'benchmarkDefault',
  mercury: 'mercury',
  your_override: 'yourOverride',
}

const VARIANT_TONE: Record<NonNullable<PrefillVariant>, string> = {
  sector_default:
    'border-primary/25 bg-primary/[0.06] text-primary/90',
  stage_default:
    'border-primary/25 bg-primary/[0.06] text-primary/90',
  benchmark_default:
    'border-primary/25 bg-primary/[0.06] text-primary/90',
  mercury:
    'border-violet-300/50 bg-violet-50/70 text-violet-800 dark:border-violet-700/40 dark:bg-violet-950/30 dark:text-violet-200',
  your_override:
    'border-foreground/15 bg-foreground/[0.04] text-foreground/65',
}

export function PrefillBadge({ variant, className }: PrefillBadgeProps) {
  const t = useTranslations('startupStudio.prefillBadge')
  if (!variant) return null
  const Icon = variant === 'your_override' ? User2 : Sparkles
  const tone = VARIANT_TONE[variant]
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        tone,
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden />
      {t(VARIANT_KEY[variant])}
    </span>
  )
}

export default PrefillBadge
