'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import { resolveAcademicValidationIssues } from '@/utils/resolveAcademicValidationIssues'

/**
 * Surfaces ValuationIQ academic guardrail failures after a calculation
 * (e.g. WACC below SME guidance) so advisors review before sharing externally.
 */
export function AcademicValidationNotice({ className }: { className?: string }) {
  const t = useTranslations('manualInput')
  const issues = useManualResultsStore((s) => resolveAcademicValidationIssues(s.result))

  if (!issues?.length) return null

  return (
    <div
      className={cn(
        'rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5 space-y-1.5',
        className
      )}
      role="status"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200/90">
        {t('academicValidation.title')}
      </p>
      <ul className="list-disc pl-4 text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-100/80">
        {issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
      <p className="text-[10px] text-amber-800/80 dark:text-amber-200/70">
        {t('academicValidation.footnote')}
      </p>
    </div>
  )
}
