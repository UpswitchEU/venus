'use client'

import { cn } from '@/design-system/utils'
import { Info, ListChecks, PanelRight } from 'lucide-react'
import type { SpotlightResolutionContext } from './useSpotlightResolutionContext'

interface SpotlightResolutionDetailsProps {
  locale: string
  resolutionContext: SpotlightResolutionContext
  onOpenSource: () => void
}

export function SpotlightResolutionDetails({
  locale,
  resolutionContext,
  onOpenSource,
}: SpotlightResolutionDetailsProps) {
  const { rows, aiNote, normHints } = resolutionContext
  const hasBody = rows.length > 0 || aiNote != null || normHints.length > 0
  if (!hasBody) return null

  return (
    <div className='rounded-md border border-foreground/10 bg-background/80 p-2 space-y-1.5'>
      <p className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>
        {locale === 'nl' ? 'Bron uit import (geen bedragen hier)' : 'Import source (no amounts here)'}
      </p>
      {aiNote && (
        <div className='flex gap-1.5 text-[10px] text-violet-700 dark:text-violet-300'>
          <Info className='w-3 h-3 shrink-0 mt-0.5' />
          <p className='leading-snug'>
            <span className='opacity-80'>AI ({aiNote.confidence}%) — </span>
            {aiNote.text}
          </p>
        </div>
      )}
      {normHints.length > 0 && (
        <div className='space-y-1.5 border-t border-foreground/[0.06] pt-1.5'>
          <p className='text-[10px] font-medium text-amber-700/90 dark:text-amber-400/90 flex items-center gap-1'>
            <ListChecks className='w-3 h-3' />
            {locale === 'nl' ? 'Normalisatie-suggesties' : 'Normalization hints'}
          </p>
          {normHints.map((h, i) => (
            <div key={i} className='text-[10px] text-muted-foreground leading-snug pl-4 border-l-2 border-amber-500/25'>
              <span className='font-medium text-foreground/85'>{h.title}</span>
              <span className='opacity-70'> · {h.confidence}%</span>
              <p className='mt-0.5'>{h.rationale}</p>
            </div>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <ul className='space-y-1 max-h-28 overflow-y-auto'>
          {rows.map(row => (
            <li
              key={`${row.account_code}-${row.description.slice(0, 24)}`}
              className='text-[10px] text-muted-foreground leading-snug font-mono'
            >
              <span className='text-foreground/80'>{row.account_code}</span>
              {' — '}
              <span className='font-sans'>
                {row.description.length > 120 ? `${row.description.slice(0, 120)}…` : row.description}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className='flex flex-wrap gap-1.5 pt-0.5'>
        <button
          type='button'
          onClick={onOpenSource}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
            'bg-primary/10 text-primary hover:bg-primary/15',
          )}
        >
          <PanelRight className='w-3 h-3' />
          {locale === 'nl' ? 'Volledige brongegevens' : 'Full source data'}
        </button>
      </div>
    </div>
  )
}
