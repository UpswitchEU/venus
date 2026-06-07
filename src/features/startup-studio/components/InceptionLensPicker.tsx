'use client'

/**
 * InceptionLensPicker — opt-in lens for the three pre-seed gaps
 * milestone-track methods miss.
 *
 * Pre-seed investing is more art than science.  The standard methodology
 * (Berkus + Scorecard + VC) systematically under-prices three founder
 * archetypes:
 *
 *   1. **Moat-blindness** — Scorecard penalises founders with no moat
 *      at the very stage where moats don't exist yet (Google '98, etc.)
 *   2. **TAM tyranny** — VC method anchors on Y5 ARR × multiple, which
 *      collapses for founders creating new markets (Shopify '08, Veeva)
 *   3. **Edge premium** — best founders cost more.  Owning 2% of a
 *      $5B+ outcome at $30M post is the bet shape (Anthropic, Lovable)
 *
 * Three opt-in levels.  Default is no-op so existing payloads round-trip
 * unchanged.  Higher levels lift the mid AND widen the band — honest
 * about increased variance, not just upside.
 *
 * Mirrors `apps/valuation-iq/src/domain/startup_valuation/inception_lens.py`.
 */

import { motion } from 'framer-motion'
import { Check, Compass } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import {
  INCEPTION_LENS_ORDER,
  INCEPTION_LENS_OVERLAY,
  type InceptionLens,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'

/** @deprecated Locale comes from next-intl. */
interface InceptionLensPickerProps {
  locale?: 'en' | 'nl' | 'fr'
}

function formatPct(pct: number, sign = '+'): string {
  if (pct === 0) return '—'
  const intPct = Math.round(pct * 100)
  return `${sign}${intPct}%`
}

export function InceptionLensPicker(_props: InceptionLensPickerProps) {
  const t = useTranslations('startupStudio.inceptionLens')
  const lens = useStartupValuationStore((s) => s.inception_lens)
  const setField = useStartupValuationStore((s) => s.setField)

  return (
    <section className="space-y-4 rounded-2xl border border-foreground/10 bg-background/60 p-6">
      <header>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Compass className="h-3.5 w-3.5 text-primary" />
          {t('heading')}
        </h2>
        <p className="mt-1 text-xs text-foreground/55">{t('subline')}</p>
      </header>

      <div className="space-y-3">
        {INCEPTION_LENS_ORDER.map((key) => {
          const overlay = INCEPTION_LENS_OVERLAY[key]
          const isActive = lens === key
          const isDefault = key === 'milestones_driven'
          const overlayLabel =
            overlay.multiplier === 1
              ? t('noOverlayChip')
              : t('overlayActive', {
                  lift: formatPct(overlay.multiplier - 1),
                  band: Math.round(overlay.bandWidenPct * 100),
                })

          return (
            <motion.button
              key={key}
              type="button"
              onClick={() => setField('inception_lens', key)}
              layout
              whileHover={{ y: -2 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'group relative w-full rounded-xl border p-4 text-left transition-all',
                'focus:outline-none focus:ring-2 focus:ring-primary/40',
                isActive
                  ? 'border-primary bg-primary/[0.06] shadow-md'
                  : 'border-foreground/10 bg-background/80 hover:border-primary/40 hover:bg-primary/[0.03]'
              )}
              aria-pressed={isActive}
            >
              {isDefault && !isActive && (
                <span className="absolute -top-2 right-3 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
                  {t('defaultBadge')}
                </span>
              )}
              {isActive && (
                <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}

              <div className="flex items-baseline justify-between gap-3 pr-6">
                <h3 className="text-sm font-semibold text-foreground">
                  {t(`levels.${key}.title`)}
                </h3>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
                  {overlayLabel}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-foreground/65">
                {t(`levels.${key}.subtitle`)}
              </p>
              {(key === 'momentum_driven' || key === 'inception_bet') && (
                <p className="mt-2 text-[11px] italic leading-relaxed text-foreground/50">
                  {t(`levels.${key}.examples`)}
                </p>
              )}
            </motion.button>
          )
        })}
      </div>

      {/* "What the lens does" methodology paragraph relocated to
          the ValuationIQ report (advisor-CTA partial / lens
          descriptors) on 2026-05-10. The picker stays as the input
          control; the engine math + variance-band explanation is
          report-side. */}
    </section>
  )
}
