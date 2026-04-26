'use client'

/**
 * ProvenanceDot
 *
 * Small colored dot next to financial input fields indicating
 * how the value was mapped from source ledger data:
 * - Green: directly mapped from a specific MAR account code
 * - Blue (computed): computed from multiple accounts or fallback-mapped
 * - Blue (nbb): imported from NBB CBSO official filing
 * - Amber: fallback mapping, needs verification
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
import { accountingProviderDisplayName } from '../../services/api/accounting'
import { useNbbPrefillStore } from '../../store/useNbbPrefillStore'
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
  nbb: {
    color: 'bg-blue-500',
    label: 'Imported from NBB filing',
    nlLabel: 'Geïmporteerd uit NBB-jaarrekening',
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
  const { importQuality, provider, getFieldMappingMethod, getFieldProvenance } = useSpotlightStore()
  const nbbSnapshot = useNbbPrefillStore((s) =>
    fiscalYear != null ? s.getYearSnapshot(fiscalYear) : undefined
  )

  const yearKey =
    fiscalYear != null && fiscalYear !== ''
      ? String(fiscalYear)
      : null

  // NBB CBSO provenance takes priority when no accounting import data exists
  const nbbField = fieldName === 'revenue' || fieldName === 'ebitda' ? fieldName : null
  const isNbbSource = !importQuality && nbbSnapshot != null && nbbField != null && nbbSnapshot[nbbField] != null

  if (!importQuality && !isNbbSource) return null

  if (isNbbSource && nbbSnapshot) {
    const style = DOT_STYLES.nbb
    const rubricsLabel = nbbSnapshot.rubricsUsed
      ? Object.entries(nbbSnapshot.rubricsUsed)
          .filter(([k]) => k === nbbField)
          .map(([, v]) => v)
          .join(', ')
      : null
    const isAbbreviated = nbbField === 'revenue' && nbbSnapshot.revenueSource === 'gross_margin'

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
            className='max-w-[260px] text-xs'
          >
            <p className='font-medium mb-1'>
              {locale === 'nl' ? style.nlLabel : style.label} ({nbbSnapshot.fiscalYear})
            </p>
            {rubricsLabel && (
              <p className='text-muted-foreground'>
                {locale === 'nl' ? 'Bron' : 'Source'}: NBB {rubricsLabel}
              </p>
            )}
            {isAbbreviated && (
              <p className='text-muted-foreground mt-1 italic'>
                {locale === 'nl'
                  ? 'Omzet niet publiek; brutomarge als basis'
                  : 'Revenue not public; using Gross Margin as base'}
              </p>
            )}
          </TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
    )
  }

  // Standard accounting import provenance
  const method = getFieldMappingMethod(fieldName, yearKey)
  if (!method) return null

  const style = DOT_STYLES[method] || DOT_STYLES.manual
  const provenance = getFieldProvenance(fieldName, yearKey)
  const sourceAccounts = provenance?.source_accounts || []

  const fetchedSnippet = (() => {
    if (!yearKey || !importQuality?.[yearKey]?.fetched_at) return null
    try {
      const d = new Date(importQuality[yearKey].fetched_at as string)
      if (Number.isNaN(d.getTime())) return null
      const providerSuffix = provider ? ` via ${accountingProviderDisplayName(provider)}` : ''
      return locale === 'nl'
        ? `Gesynchroniseerd${providerSuffix}: ${d.toLocaleString('nl-BE')}`
        : `Synced${providerSuffix}: ${d.toLocaleString('en-BE')}`
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
