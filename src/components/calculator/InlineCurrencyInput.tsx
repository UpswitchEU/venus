'use client'

/**
 * InlineCurrencyInput — slim euro-amount input for dense tables.
 *
 * Why not the Aurora `<CurrencyInput>` here? Aurora ships a 56px floating-label
 * input ideal for standalone forms, but in a table row the column header
 * already labels the column — a per-row floating label dwarfs the year/metric
 * cell next to it and the row height jitters when a single cell enters edit
 * mode. This variant matches the row rhythm (h-9 / h-8) and stays
 * right-aligned for column scanning. It reuses nl-BE / en-BE grouping and the
 * same focus / error / warning ring states as the rest of Aurora.
 */

import { useLocale } from 'next-intl'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { cn } from '@/design-system/utils'

export type InlineCurrencyInputState = 'default' | 'warning' | 'error'

export interface InlineCurrencyInputProps {
  value: number | undefined
  onChange: (value: number | undefined) => void
  ariaLabel?: string
  state?: InlineCurrencyInputState
  disabled?: boolean
  /** Allow negative values (e.g. FCFF turnaround years, ΔNWC release). */
  allowNegative?: boolean
  /** Pixel height of the input — default `h-9` matches a `py-2` cell. */
  size?: 'xs' | 'sm'
  /** Override the placeholder shown when value is undefined. Default: `0`. */
  placeholder?: string
  /** Max-width cap on the input box. Default `160px`. */
  maxWidthClass?: string
  className?: string
}

function parseSignedDigits(raw: string, allowNegative: boolean): number | undefined {
  const trimmed = raw.trim()
  if (trimmed === '' || (allowNegative && trimmed === '-')) return undefined
  const sign = allowNegative && trimmed.startsWith('-') ? -1 : 1
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return undefined
  return sign * parseInt(digits, 10)
}

const HEIGHT_BY_SIZE: Record<NonNullable<InlineCurrencyInputProps['size']>, string> = {
  xs: 'h-8',
  sm: 'h-9',
}

export function InlineCurrencyInput({
  value,
  onChange,
  ariaLabel,
  state = 'default',
  disabled,
  allowNegative = false,
  size = 'sm',
  placeholder = '0',
  maxWidthClass = 'max-w-[160px]',
  className,
}: InlineCurrencyInputProps) {
  const locale = useLocale()
  const inputId = useId()
  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'fr' ? 'fr-BE' : locale === 'en' ? 'en-BE' : 'nl-BE', {
        maximumFractionDigits: 0,
        useGrouping: true,
      }),
    [locale]
  )
  const format = useCallback(
    (n?: number) => (n == null || !Number.isFinite(n) ? '' : formatter.format(n)),
    [formatter]
  )
  const [display, setDisplay] = useState(() => format(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDisplay(format(value))
  }, [format, value])

  const heightClass = HEIGHT_BY_SIZE[size]

  return (
    <div
      className={cn(
        'relative inline-flex w-full items-center rounded-lg border bg-background shadow-sm transition-colors',
        heightClass,
        maxWidthClass,
        state === 'error'
          ? 'border-destructive/50 focus-within:border-destructive/60 focus-within:ring-2 focus-within:ring-destructive/20'
          : state === 'warning'
            ? 'border-warning/45 focus-within:border-warning/55 focus-within:ring-2 focus-within:ring-warning/20'
            : 'border-foreground/10 hover:border-foreground/20 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20',
        disabled && 'cursor-not-allowed opacity-60',
        className
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none pl-2.5 text-xs font-medium text-foreground/45 select-none"
      >
        €
      </span>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        inputMode={allowNegative ? 'text' : 'numeric'}
        autoComplete="off"
        disabled={disabled}
        value={display}
        aria-label={ariaLabel}
        aria-invalid={state === 'error' || undefined}
        placeholder={placeholder}
        onFocus={(e) => requestAnimationFrame(() => e.target.select())}
        onChange={(e) => {
          const raw = e.target.value
          const num = parseSignedDigits(raw, allowNegative)
          if (num !== undefined) {
            setDisplay(formatter.format(num))
          } else if (allowNegative && raw.trim() === '-') {
            setDisplay('-')
          } else {
            setDisplay('')
          }
          onChange(num)
        }}
        onBlur={() => setDisplay(format(value))}
        onPaste={(e) => {
          e.preventDefault()
          const num = parseSignedDigits(e.clipboardData.getData('text'), allowNegative)
          setDisplay(format(num))
          onChange(num)
        }}
        className={cn(
          'w-full flex-1 min-w-0 rounded-lg bg-transparent pl-1.5 pr-2.5 text-right text-sm font-medium tabular-nums text-foreground placeholder:text-foreground/35 focus:outline-none disabled:cursor-not-allowed',
          heightClass
        )}
      />
    </div>
  )
}
