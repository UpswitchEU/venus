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
import { FileText } from 'lucide-react'
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
      </motion.div>
    </div>
  )
}
