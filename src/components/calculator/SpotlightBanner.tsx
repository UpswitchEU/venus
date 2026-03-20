'use client'

/**
 * SpotlightBanner — guided resolution strip (active when import has actionable flags or forced from URL).
 */

import { cn } from '@/design-system/utils'
import { AlertTriangle, ChevronLeft, ChevronRight, Eye, EyeOff, X } from 'lucide-react'
import { useLocale } from 'next-intl'
import { useEffect } from 'react'
import { useSpotlightStore } from '../../store/useSpotlightStore'

export function SpotlightBanner() {
  const locale = useLocale()
  const {
    isSpotlightActive,
    orderedFlagDomIds,
    resolvedFields,
    activeDomId,
    dismissSpotlight,
    nextFlag,
    prevFlag,
    toggleSourcePanel,
    showSourcePanel,
    getFlagsForDomId,
  } = useSpotlightStore()

  useEffect(() => {
    if (!isSpotlightActive || !activeDomId) return
    const scrollToActive = () => {
      try {
        document
          .querySelector(`[data-spotlight-field="${CSS.escape(activeDomId)}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } catch {
        document
          .querySelector(`[data-spotlight-field="${activeDomId}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
    requestAnimationFrame(scrollToActive)
  }, [activeDomId, isSpotlightActive])

  if (!isSpotlightActive) return null

  const unresolved = orderedFlagDomIds.filter(id => !resolvedFields.has(id))
  if (unresolved.length === 0) return null

  const cur =
    activeDomId && unresolved.includes(activeDomId) ? activeDomId : unresolved[0]
  const curIdx = Math.max(0, unresolved.indexOf(cur))
  const curFlagMsg = getFlagsForDomId(cur)[0]?.message ?? ''

  return (
    <div className='flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-3'>
      <div className='flex items-start gap-2 flex-1 min-w-0'>
        <AlertTriangle className='w-4 h-4 text-amber-500 shrink-0 mt-0.5' />

        <div className='min-w-0 flex-1'>
          <p className='text-xs text-foreground'>
            {locale === 'nl' ? (
              <>
                <span className='font-medium'>{unresolved.length}</span> veld(en) vereisen aandacht
              </>
            ) : (
              <>
                <span className='font-medium'>{unresolved.length}</span> field(s) need attention
              </>
            )}
          </p>
          {curFlagMsg ? (
            <p className='text-[11px] text-muted-foreground mt-1 line-clamp-2' title={curFlagMsg}>
              {curFlagMsg}
            </p>
          ) : null}
        </div>
      </div>

      <div className='flex items-center gap-1 shrink-0 ml-auto'>
        <button
          type='button'
          onClick={prevFlag}
          className='p-1 rounded hover:bg-foreground/5 transition-colors'
          aria-label='Previous flag'
        >
          <ChevronLeft className='w-3.5 h-3.5 text-muted-foreground' />
        </button>
        <span className='text-xs text-muted-foreground tabular-nums min-w-[2.5rem] text-center'>
          {curIdx + 1}/{unresolved.length}
        </span>
        <button
          type='button'
          onClick={nextFlag}
          className='p-1 rounded hover:bg-foreground/5 transition-colors'
          aria-label='Next flag'
        >
          <ChevronRight className='w-3.5 h-3.5 text-muted-foreground' />
        </button>

        <button
          type='button'
          onClick={toggleSourcePanel}
          className={cn(
            'p-1.5 rounded transition-colors',
            showSourcePanel
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-foreground/5 text-muted-foreground'
          )}
          title={locale === 'nl' ? 'Brongegevens tonen' : 'View source data'}
        >
          {showSourcePanel ? <EyeOff className='w-3.5 h-3.5' /> : <Eye className='w-3.5 h-3.5' />}
        </button>

        <button
          type='button'
          onClick={dismissSpotlight}
          className='p-1.5 rounded hover:bg-foreground/5 transition-colors text-muted-foreground'
          title={locale === 'nl' ? 'Spotlight sluiten' : 'Dismiss spotlight'}
        >
          <X className='w-3.5 h-3.5' />
        </button>
      </div>
    </div>
  )
}
