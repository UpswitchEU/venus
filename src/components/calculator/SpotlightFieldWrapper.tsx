'use client'

/**
 * SpotlightFieldWrapper — dim non-flagged fields; highlight & resolve flagged cells (per fiscal year).
 * Resolution context (import lines, AI, normalization hints) lives in SpotlightResolutionDetails.
 */

import { cn } from '@/design-system/utils'
import { AlertCircle, AlertTriangle, Check, Info } from 'lucide-react'
import { useLocale } from 'next-intl'
import type { ReactNode } from 'react'
import { spotlightDomId, useSpotlightStore } from '../../store/useSpotlightStore'
import { SpotlightResolutionDetails } from './SpotlightResolutionDetails'
import { useSpotlightResolutionContext } from './useSpotlightResolutionContext'

interface SpotlightFieldWrapperProps {
  fieldName: string
  fiscalYear?: string | number | null
  children: ReactNode
  className?: string
}

export function SpotlightFieldWrapper({
  fieldName,
  fiscalYear,
  children,
  className,
}: SpotlightFieldWrapperProps) {
  const locale = useLocale()
  const domId = spotlightDomId(fieldName, fiscalYear ?? undefined)
  const {
    isSpotlightActive,
    orderedFlagDomIds,
    resolvedFields,
    getFlagsForDomId,
    activeDomId,
    resolveField,
    openSourcePanel,
  } = useSpotlightStore()

  const isInQueue = isSpotlightActive && orderedFlagDomIds.includes(domId)
  const isResolved = resolvedFields.has(domId)
  const isDimmed = isSpotlightActive && !isInQueue
  const isActive = activeDomId === domId && isInQueue && !isResolved
  const flags = isInQueue ? getFlagsForDomId(domId).filter(f => f.severity !== 'info') : []
  const highestSeverity = flags.reduce<'error' | 'warning' | 'info'>((acc, f) => {
    if (f.severity === 'error') return 'error'
    if (f.severity === 'warning' && acc !== 'error') return 'warning'
    return acc
  }, 'info')

  const { resolutionContext } = useSpotlightResolutionContext({
    domId,
    fieldName,
    isInQueue,
    locale,
  })

  const hasDetails =
    resolutionContext &&
    (resolutionContext.rows.length > 0 ||
      resolutionContext.aiNote != null ||
      resolutionContext.normHints.length > 0)

  if (!isSpotlightActive) {
    return <div className={className}>{children}</div>
  }

  return (
    <div
      className={cn(
        'relative transition-all duration-300',
        isDimmed && 'opacity-45',
        isInQueue && !isResolved && highestSeverity === 'error' && 'ring-2 ring-red-500/30 rounded-lg',
        isInQueue && !isResolved && highestSeverity === 'warning' && 'ring-2 ring-amber-500/30 rounded-lg',
        isActive && 'ring-2 ring-primary/40 rounded-lg',
        isResolved && 'ring-2 ring-emerald-500/30 rounded-lg',
        className,
      )}
      data-spotlight-field={domId}
    >
      {children}

      {isInQueue && !isResolved && flags.length > 0 && (
        <div
          className={cn(
            'flex items-start gap-2 mt-1.5 px-2.5 py-2 rounded-md text-xs',
            highestSeverity === 'error' && 'bg-red-500/8 text-red-600 dark:text-red-400',
            highestSeverity === 'warning' && 'bg-amber-500/8 text-amber-600 dark:text-amber-400',
            highestSeverity === 'info' && 'bg-blue-500/8 text-blue-600 dark:text-blue-400',
          )}
        >
          {highestSeverity === 'error' ? (
            <AlertCircle className='w-3.5 h-3.5 mt-0.5 shrink-0' />
          ) : highestSeverity === 'warning' ? (
            <AlertTriangle className='w-3.5 h-3.5 mt-0.5 shrink-0' />
          ) : (
            <Info className='w-3.5 h-3.5 mt-0.5 shrink-0' />
          )}

          <div className='flex-1 min-w-0 space-y-2'>
            <div>
              <p className='font-medium'>{flags[0].message}</p>
              {flags[0].source_accounts.length > 0 && (
                <p className='text-[10px] opacity-70 mt-0.5'>
                  {locale === 'nl' ? 'Rekeningen' : 'Accounts'}: {flags[0].source_accounts.join(', ')}
                </p>
              )}
            </div>

            {hasDetails && resolutionContext && (
              <SpotlightResolutionDetails
                locale={locale}
                resolutionContext={resolutionContext}
                onOpenSource={() => openSourcePanel()}
              />
            )}
          </div>

          <button
            type='button'
            onClick={() => resolveField(domId)}
            className={cn(
              'shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
              'bg-foreground/5 hover:bg-foreground/10 text-foreground self-start',
            )}
          >
            <Check className='w-3 h-3' />
            {locale === 'nl' ? 'Gereviewd' : 'Reviewed'}
          </button>
        </div>
      )}

      {isResolved && (
        <div className='flex items-center gap-1.5 mt-1 px-2 text-xs text-emerald-600 dark:text-emerald-400'>
          <Check className='w-3 h-3' />
          <span>{locale === 'nl' ? 'Bevestigd' : 'Confirmed'}</span>
        </div>
      )}
    </div>
  )
}
