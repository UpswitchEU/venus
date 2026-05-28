'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import { useSectorMismatchWarning } from '@/hooks/useSectorMismatchWarning'
import { useManualFormStore } from '@/store/manual/useManualFormStore'

/**
 * Surfaces KBO/NACE vs selected business type mismatch on the report panel
 * so advisors see it where they review before sharing (not only in Basic Information).
 */
export function SectorMismatchNotice({ className }: { className?: string }) {
  const t = useTranslations()
  const formData = useManualFormStore((s) => s.formData)
  const warning = useSectorMismatchWarning(formData)

  if (!warning) return null

  return (
    <div
      className={cn(
        'rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5',
        className
      )}
      role="status"
    >
      <p className="text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-100/80">
        {t('forms.warnings.sectorMismatch', {
          naceType: warning.naceTypeTitle,
          selected: warning.selectedTitle,
        })}
      </p>
    </div>
  )
}
