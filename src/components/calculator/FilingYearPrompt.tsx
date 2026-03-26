'use client'

import { AlertCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { FormEvent, useMemo, useState } from 'react'
import { cn } from '@/design-system/utils'

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

  const suggestedYears = useMemo(() => [defaultYear, defaultYear + 1], [defaultYear])

  if (dismissed) return null

  const submitCustomYear = (e: FormEvent) => {
    e.preventDefault()
    const parsedYear = Number.parseInt(customYear, 10)
    if (Number.isFinite(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100) {
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
        {suggestedYears.map((year, index) => (
          <button
            key={year}
            type="button"
            onClick={() => onSelect(year)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              index === 0
                ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
                : 'border-amber-500/20 bg-background/80 text-foreground/80 hover:bg-background'
            )}
          >
            {year}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustomYear((current) => !current)}
          className={cn(
            'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
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
            max={2100}
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
