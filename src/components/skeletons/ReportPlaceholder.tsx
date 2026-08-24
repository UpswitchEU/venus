/**
 * Report Placeholder
 *
 * Default state for the right panel when no report exists yet.
 * Shown on page load (Clarity-style) before the user clicks Calculate.
 * Skeleton loading appears only after the valuation CTA is clicked.
 *
 * @module components/skeletons/ReportPlaceholder
 */

import { motion } from 'framer-motion'
import { Check, FileText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import React from 'react'

export function ReportPlaceholder() {
  const t = useTranslations('report')

  return (
    <div className="relative h-full flex flex-col items-center justify-center p-8 text-center overflow-hidden bg-card">
      {/* Subtle gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--card) / 0.95) 100%)',
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="w-12 h-12 rounded-xl border border-foreground/[0.08] bg-background flex items-center justify-center mb-3 sm:mb-4 mx-auto">
          <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-foreground">{t('placeholder.title')}</h3>
        <p className="mt-2 text-sm text-foreground/50 max-w-sm mx-auto leading-relaxed">
          {t('placeholder.description')}
        </p>
        <div className="mx-auto mt-6 max-w-sm divide-y divide-foreground/[0.06] rounded-xl border border-foreground/[0.08] bg-background/80 px-4 text-left">
          {(['context', 'financials', 'result'] as const).map((item, index) => (
            <div key={item} className="flex items-center gap-3 py-3 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                {index < 2 ? <Check className="h-3 w-3" aria-hidden /> : index + 1}
              </span>
              <span className={index < 2 ? 'text-foreground/70' : 'text-foreground/45'}>
                {t(`placeholder.${item}`)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-5 text-xs text-foreground/40">
          {t('placeholder.time')}
        </div>
      </motion.div>
    </div>
  )
}
