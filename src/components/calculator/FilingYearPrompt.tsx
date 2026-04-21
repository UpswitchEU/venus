'use client'

import { AlertCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { FormEvent, useMemo, useState } from 'react'
import { cn } from '@/design-system/utils'
import { getCurrentFilingYear } from '../../utils/fiscalYear'

interface FilingYearPromptProps {
  defaultYear: number
  dismissed?: boolean
  onSelect: (year: number) => void
}

export function FilingYearPrompt({
  defaultYear,
  dismissed = false,
  onSelect,
}: FilingYearPromptProps) {
  const locale = useLocale()
  const mi = useTranslations('manualInput')
  const actions = useTranslations('common.actions')
  const [showCustomYear, setShowCustomYear] = useState(false)
  const [customYear, setCustomYear] = useState('')
  const maxSelectableYear = getCurrentFilingYear()

  const suggestedYears = useMemo(() => {
    return [Math.min(defaultYear, maxSelectableYear)]
  }, [defaultYear, maxSelectableYear])

  if (dismissed) return null

  const submitCustomYear = (e: FormEvent) => {
    e.preventDefault()
    const parsedYear = Number.parseInt(customYear, 10)
    if (Number.isFinite(parsedYear) && parsedYear >= 2000 && parsedYear <= maxSelectableYear) {
      onSelect(parsedYear)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{mi('filingYearPromptTitle')}</p>
          <p className="mt-1 text-xs text-foreground/70">{mi('filingYearPromptDescription')}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {suggestedYears.map((year, index) => {
          const isPrimary = index === 0
          const label = isPrimary ? mi('filingYearLabelSafeDefault') : mi('filingYearLabelBooksClosed')
          const ariaLabel = isPrimary
            ? mi('filingYearAriaSafeDefault', { year })
            : mi('filingYearAriaBooksClosed', { year })
          return (
            <button
              key={year}
              type="button"
              onClick={() => onSelect(year)}
              aria-label={ariaLabel}
              className={cn(
                'flex min-w-[7.5rem] flex-col items-stretch rounded-lg border px-3 py-2 text-left transition-colors',
                isPrimary
                  ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
                  : 'border-amber-500/20 bg-background/80 text-foreground/80 hover:bg-background'
              )}
            >
              <span className="text-base font-semibold tabular-nums leading-tight">{year}</span>
              <span
                className={cn(
                  'mt-0.5 text-[11px] font-medium leading-snug',
                  isPrimary ? 'text-primary/90' : 'text-foreground/70'
                )}
              >
                {label}
              </span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setShowCustomYear((current) => !current)}
          className={cn(
            'flex min-h-[3.25rem] items-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
            showCustomYear
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-amber-500/20 bg-background/80 text-foreground/80 hover:bg-background'
          )}
        >
          {mi('filingYearOther')}
        </button>
      </div>

      {showCustomYear && (
        <form onSubmit={submitCustomYear} className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={2000}
            max={maxSelectableYear}
            inputMode="numeric"
            placeholder="YYYY"
            value={customYear}
            onChange={(e) => setCustomYear(e.target.value)}
            aria-label={locale === 'nl' ? 'Aangepast boekjaar' : 'Custom filing year'}
            className="h-9 w-28 rounded-lg border border-amber-500/20 bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/40"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {actions('apply')}
          </button>
        </form>
      )}
    </div>
  )
}
