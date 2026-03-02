/**
 * Report Placeholder
 *
 * Default state for the right panel when no report exists yet.
 * Shown on page load (Clarity-style) before the user clicks Calculate.
 * Skeleton loading appears only after the valuation CTA is clicked.
 *
 * @module components/skeletons/ReportPlaceholder
 */

import { useTranslations } from 'next-intl'
import React from 'react'

export function ReportPlaceholder() {
  const t = useTranslations('report')

  return (
    <div className="h-full flex flex-col items-center justify-center px-8 py-12 text-center">
      <h3 className="text-lg font-semibold text-foreground mb-3">
        {t('placeholder.title')}
      </h3>
      <p className="text-sm text-foreground/70 max-w-md mb-4 leading-relaxed">
        {t('placeholder.description')}
      </p>
      <p className="text-xs text-foreground/50">
        {t('placeholder.time')}
      </p>
    </div>
  )
}
