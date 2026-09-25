'use client'

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import { resolveAcademicValidationIssues } from '@/utils/resolveAcademicValidationIssues'

/**
 * ValuationIQ guardrail findings after a calculation (e.g. WACC below SME guidance),
 * so advisors review them before sharing. One quiet line that opens the list:
 * the report's disclaimers page carries the full wording.
 */
export function AcademicValidationNotice({ className }: { className?: string }) {
  const t = useTranslations('manualInput')
  const issues = useManualResultsStore((s) => resolveAcademicValidationIssues(s.result))

  if (!issues?.length) return null

  return (
    <details
      className={cn(
        'group rounded-lg border border-amber-500/25 bg-amber-500/[0.05] px-3 py-2 text-[11px]',
        className
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-amber-800 dark:text-amber-200 [&::-webkit-details-marker]:hidden">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
        {t('academicValidation.summary', { count: issues.length })}
        <ChevronDown
          className="ml-auto h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-4 leading-relaxed text-amber-900/90 dark:text-amber-100/80">
        {issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
    </details>
  )
}
