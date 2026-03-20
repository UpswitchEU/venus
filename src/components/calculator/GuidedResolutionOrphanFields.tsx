'use client'

/**
 * Surfaces import/AI flags whose `field` is not on the streamlined Revenue/EBITDA/Industry form.
 * Without this, spotlight navigation would scroll nowhere — a major guided-resolution blocker.
 */

import { cn } from '@/design-system/utils'
import { AlertCircle, AlertTriangle, Check, Info } from 'lucide-react'
import { useLocale } from 'next-intl'
import { useMemo } from 'react'
import { parseSpotlightDomId, useSpotlightStore } from '../../store/useSpotlightStore'
import { SPOTLIGHT_QUICK_FORM_FIELDS } from './spotlight-quick-form-fields'
import { SpotlightResolutionDetails } from './SpotlightResolutionDetails'
import { useSpotlightResolutionContext } from './useSpotlightResolutionContext'

export function GuidedResolutionOrphanFields() {
  const locale = useLocale()
  const {
    isSpotlightActive,
    orderedFlagDomIds,
    resolvedFields,
    activeDomId,
    getFlagsForDomId,
    resolveField,
    openSourcePanel,
  } = useSpotlightStore()

  const orphans = orderedFlagDomIds.filter(domId => {
    if (resolvedFields.has(domId)) return false
    const { field } = parseSpotlightDomId(domId)
    return !SPOTLIGHT_QUICK_FORM_FIELDS.has(field)
  })

  if (!isSpotlightActive || orphans.length === 0) return null

  return (
    <div className='space-y-3 mb-2'>
      {orphans.map(domId => (
        <OrphanFlagCard
          key={domId}
          domId={domId}
          isActive={activeDomId === domId}
          locale={locale}
        />
      ))}
    </div>
  )
}

function OrphanFlagCard({
  domId,
  isActive,
  locale,
}: {
  domId: string
  isActive: boolean
  locale: string
}) {
  const { field } = parseSpotlightDomId(domId)
  const importQuality = useSpotlightStore(s => s.importQuality)
  const resolveField = useSpotlightStore(s => s.resolveField)
  const openSourcePanel = useSpotlightStore(s => s.openSourcePanel)
  const isInQueue = useSpotlightStore(
    s => s.isSpotlightActive && s.orderedFlagDomIds.includes(domId) && !s.resolvedFields.has(domId),
  )
  const flags = useMemo(() => {
    return useSpotlightStore.getState().getFlagsForDomId(domId).filter(f => f.severity !== 'info')
  }, [domId, importQuality])

  const { resolutionContext } = useSpotlightResolutionContext({
    domId,
    fieldName: field,
    isInQueue,
    locale,
  })

  if (flags.length === 0) return null

  const highestSeverity = flags.reduce<'error' | 'warning' | 'info'>((acc, f) => {
    if (f.severity === 'error') return 'error'
    if (f.severity === 'warning' && acc !== 'error') return 'warning'
    return acc
  }, 'info')

  const hasDetails =
    resolutionContext &&
    (resolutionContext.rows.length > 0 ||
      resolutionContext.aiNote != null ||
      resolutionContext.normHints.length > 0)

  return (
    <div
      data-spotlight-field={domId}
      className={cn(
        'rounded-xl border p-3 transition-all',
        highestSeverity === 'error' && 'border-red-500/25 bg-red-500/[0.04]',
        highestSeverity === 'warning' && 'border-amber-500/25 bg-amber-500/[0.05]',
        isActive && 'ring-2 ring-primary/35',
      )}
    >
      <div className='flex items-start gap-2 text-xs'>
        {highestSeverity === 'error' ? (
          <AlertCircle className='w-3.5 h-3.5 mt-0.5 shrink-0 text-red-500' />
        ) : highestSeverity === 'warning' ? (
          <AlertTriangle className='w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500' />
        ) : (
          <Info className='w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500' />
        )}
        <div className='flex-1 min-w-0 space-y-2'>
          <div>
            <p className='text-[10px] font-mono text-muted-foreground uppercase tracking-wide'>
              {field.replace(/_/g, ' ')}
            </p>
            <p className='font-medium text-foreground mt-0.5'>{flags[0].message}</p>
            {flags[0].source_accounts.length > 0 && (
              <p className='text-[10px] text-muted-foreground mt-0.5'>
                {locale === 'nl' ? 'Rekeningen' : 'Accounts'}: {flags[0].source_accounts.join(', ')}
              </p>
            )}
          </div>
          <p className='text-[10px] text-muted-foreground leading-snug bg-foreground/[0.03] rounded-md px-2 py-1.5'>
            {locale === 'nl'
              ? 'Deze rubriek staat niet op het korte formulier. Controleer de agregaten hierboven (omzet/EBITDA), gebruik Normalisaties of pas de mapping aan via brongegevens.'
              : 'This line is not on the quick form. Verify totals above (Revenue/EBITDA), use Normalizations, or reconcile via Source data.'}
          </p>
          {hasDetails && resolutionContext && (
            <SpotlightResolutionDetails
              locale={locale}
              resolutionContext={resolutionContext}
              onOpenSource={() => openSourcePanel()}
            />
          )}
          <button
            type='button'
            onClick={() => resolveField(domId)}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
              'bg-foreground/5 hover:bg-foreground/10 text-foreground',
            )}
          >
            <Check className='w-3 h-3' />
            {locale === 'nl' ? 'Gereviewd' : 'Reviewed'}
          </button>
        </div>
      </div>
    </div>
  )
}
