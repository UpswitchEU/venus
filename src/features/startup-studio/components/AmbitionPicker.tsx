'use client'

/**
 * AmbitionPicker — three plain-language cards that replace the VC-method
 * technical inputs (Year-5 revenue, exit multiple, target ROI).
 *
 * Why this exists:
 *   The Express valuation flow targets pre-seed *founders*, not VCs.
 *   Founders know their company, their stage, their sector, and how big
 *   they want to get.  They don't know "exit multiple" or "target ROI"
 *   — those are VC-internal numbers a non-finance founder would either
 *   skip or look up via Claude / ChatGPT.  This component asks "how big
 *   do you want this to get?" and derives the technicals from a
 *   sector-aware lookup ([./data/ambition.ts](./data/ambition.ts)).
 *
 * The engine still consumes Y5 / exit / ROI exactly the same way —
 * picking a card writes those values into the store via setField, so
 * the live receipt + canonical request payload don't change shape.
 */

import { motion } from 'framer-motion'
import { Check, TrendingUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import {
  AMBITION_ORDER,
  type AmbitionLevel,
  getAmbitionAnchors,
  inferAmbition,
} from '@/features/startup-studio/data/ambition'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import { formatEur } from '@/features/startup-studio/hooks/useLiveValuation'
import { cn } from '@/lib/utils'

/** @deprecated Locale comes from next-intl. */
interface AmbitionPickerProps {
  locale?: 'en' | 'nl'
}

export function AmbitionPicker(_props: AmbitionPickerProps) {
  const t = useTranslations('startupStudio.ambition')
  const sector = useStartupValuationStore((s) => s.sector)
  const y5 = useStartupValuationStore((s) => s.year5_revenue_projection)
  const exit = useStartupValuationStore((s) => s.exit_revenue_multiple)
  const roi = useStartupValuationStore((s) => s.target_roi_x)
  const setField = useStartupValuationStore((s) => s.setField)

  const active = useMemo(
    () => inferAmbition(sector, y5, exit, roi),
    [sector, y5, exit, roi],
  )

  const handlePick = (level: AmbitionLevel) => {
    const anchors = getAmbitionAnchors(sector, level)
    setField('year5_revenue_projection', anchors.year5_revenue)
    setField('exit_revenue_multiple', anchors.exit_revenue_multiple)
    setField('target_roi_x', anchors.target_roi_x)
  }

  const standardTitle = t('levels.standard.title')

  return (
    <section className="space-y-4 rounded-2xl border border-foreground/10 bg-background/60 p-6">
      <header>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          {t('heading')}
        </h2>
        <p className="mt-1 text-xs text-foreground/55">{t('subline')}</p>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        {AMBITION_ORDER.map((level) => {
          const anchors = getAmbitionAnchors(sector, level)
          const isActive = active === level
          const isStandard = level === 'standard'

          return (
            <motion.button
              key={level}
              type="button"
              onClick={() => handlePick(level)}
              layout
              whileHover={{ y: -2 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'group relative flex h-full flex-col rounded-xl border p-4 text-left transition-all',
                'focus:outline-none focus:ring-2 focus:ring-primary/40',
                isActive
                  ? 'border-primary bg-primary/[0.06] shadow-md'
                  : 'border-foreground/10 bg-background/80 hover:border-primary/40 hover:bg-primary/[0.03]',
              )}
              aria-pressed={isActive}
            >
              {isStandard && !isActive && (
                <span className="absolute -top-2 right-3 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  {t('recommended')}
                </span>
              )}

              {isActive && (
                <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}

              <h3 className="pr-8 text-sm font-semibold text-foreground">
                {t(`levels.${level}.title`)}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-foreground/65">
                {t(`levels.${level}.subtitle`)}
              </p>

              <div className="mt-3 rounded-lg bg-foreground/[0.04] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                  {t('y5Anchor')}
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {formatEur(anchors.year5_revenue)}
                </p>
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-foreground/55">
                {t(`levels.${level}.outcome`)}
              </p>
            </motion.button>
          )
        })}
      </div>

      <p className="text-[11px] text-foreground/45">{t('footer', { title: standardTitle })}</p>
    </section>
  )
}
