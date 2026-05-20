'use client'

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LEDGER_LABEL_TEXT_CLASSES } from '@/constants/ledgerLabelTypography'
import { cn } from '@/design-system/utils'

interface UnifiedNormalizationEditorToggleProps {
  expanded: boolean
  onToggle: () => void
}

export function UnifiedNormalizationEditorToggle({
  expanded,
  onToggle,
}: UnifiedNormalizationEditorToggleProps) {
  const nh = useTranslations('normalizationHub')

  return (
    <section className="px-6 pt-4 pb-2 shrink-0" role="region" aria-labelledby="section1-header">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls="normalization-editor-panel"
        className="flex w-full items-start justify-between gap-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-4 py-3 text-left transition-colors hover:bg-foreground/[0.04]"
      >
        <div className="min-w-0 pr-2">
          <h3 id="section1-header" className="text-sm font-semibold text-foreground">
            {nh('editorToggleTitle')}
          </h3>
          <p
            className={cn(
              'mt-0.5 text-xs text-foreground/50 leading-snug',
              LEDGER_LABEL_TEXT_CLASSES,
              expanded && 'sr-only'
            )}
          >
            {nh('editorToggleSubtitle')}
          </p>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-foreground/40 transition-transform mt-0.5',
            expanded && 'rotate-180'
          )}
        />
      </button>
    </section>
  )
}
