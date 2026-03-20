'use client'

/**
 * ProvenanceDot
 *
 * Small colored dot next to financial input fields indicating
 * how the value was mapped from source ledger data:
 * - Green: directly mapped from a specific MAR account code
 * - Amber: computed from multiple accounts or fallback-mapped
 * - Gray: manually entered (no ledger source)
 *
 * Hover tooltip shows the exact source accounts.
 */

import { cn } from '@/design-system/utils'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/design-system/components/Tooltip'
import { useLocale } from 'next-intl'
import { useSpotlightStore } from '../../store/useSpotlightStore'

interface ProvenanceDotProps {
  fieldName: string
  /** Fiscal year key matching import_quality / yearlyFinancials row */
  fiscalYear?: string | number | null
  className?: string
}

const DOT_STYLES: Record<string, { color: string; label: string; nlLabel: string }> = {
  direct: {
    color: 'bg-emerald-500',
    label: 'Directly mapped from source',
    nlLabel: 'Direct gekoppeld aan bron',
  },
  computed: {
    color: 'bg-blue-500',
    label: 'Computed from multiple accounts',
    nlLabel: 'Berekend uit meerdere rekeningen',
  },
  fallback: {
    color: 'bg-amber-500',
    label: 'Fallback mapping — verify',
    nlLabel: 'Terugvalkoppeling — controleer',
  },
  manual: {
    color: 'bg-foreground/30',
    label: 'Manually entered',
    nlLabel: 'Handmatig ingevoerd',
  },
}

export function ProvenanceDot({ fieldName, fiscalYear, className }: ProvenanceDotProps) {
  const locale = useLocale()
  const { importQuality, getFieldMappingMethod, getFieldProvenance } = useSpotlightStore()

  if (!importQuality) return null

  const yearKey =
    fiscalYear != null && fiscalYear !== ''
      ? String(fiscalYear)
      : null

  const method = getFieldMappingMethod(fieldName, yearKey)
  if (!method) return null

  const style = DOT_STYLES[method] || DOT_STYLES.manual
  const provenance = getFieldProvenance(fieldName, yearKey)
  const sourceAccounts = provenance?.source_accounts || []

  const fetchedSnippet = (() => {
    if (!yearKey || !importQuality[yearKey]?.fetched_at) return null
    try {
      const d = new Date(importQuality[yearKey].fetched_at as string)
      if (Number.isNaN(d.getTime())) return null
      return locale === 'nl'
        ? `Gesynchroniseerd: ${d.toLocaleString('nl-BE')}`
        : `Synced: ${d.toLocaleString('en-BE')}`
    } catch {
      return null
    }
  })()

  return (
    <TooltipProvider delayDuration={200}>
      <TooltipRoot>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-block w-2 h-2 rounded-full shrink-0 cursor-help',
              style.color,
              className,
            )}
            aria-label={locale === 'nl' ? style.nlLabel : style.label}
          />
        </TooltipTrigger>
        <TooltipContent
          side='top'
          className='max-w-[240px] text-xs'
        >
          <p className='font-medium mb-1'>
            {locale === 'nl' ? style.nlLabel : style.label}
          </p>
          {sourceAccounts.length > 0 && (
            <p className='text-muted-foreground'>
              {locale === 'nl' ? 'Bron' : 'Source'}: MAR {sourceAccounts.slice(0, 5).join(', ')}
              {sourceAccounts.length > 5 && ` +${sourceAccounts.length - 5}`}
            </p>
          )}
          {fetchedSnippet && (
            <p className='text-muted-foreground mt-1'>{fetchedSnippet}</p>
          )}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}
