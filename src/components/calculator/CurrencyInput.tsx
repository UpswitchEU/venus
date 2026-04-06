'use client'

/**
 * CurrencyInput -- Euro-formatted text input for accountants
 *
 * Displays nl-BE thousand separators (dots) while typing.
 * Stores raw number internally, formats display string live.
 */

import { useLocale } from 'next-intl'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AuroraInput } from '@/design-system'

function parseRawDigits(str: string): number | undefined {
  const digits = str.replace(/\D/g, '')
  if (!digits) return undefined
  return parseInt(digits, 10)
}

function parseSignedRawDigits(str: string): number | undefined {
  const sign = str.trim().startsWith('-') ? -1 : 1
  const digits = str.replace(/\D/g, '')
  if (!digits) return undefined
  return sign * parseInt(digits, 10)
}

export interface CurrencyInputProps {
  value?: number
  onChange: (value: number | undefined) => void
  label?: string
  placeholder?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  disabled?: boolean
  rightIcon?: React.ReactNode
  allowNegative?: boolean
  ariaLabel?: string
  id?: string
  name?: string
}

export function CurrencyInput({
  value,
  onChange,
  label,
  placeholder = '1.500.000',
  size = 'sm',
  className,
  disabled,
  rightIcon,
  allowNegative = false,
  ariaLabel,
  id,
  name,
}: CurrencyInputProps) {
  const locale = useLocale()
  const inputId = useId()
  const resolvedId = id ?? name ?? inputId
  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
        maximumFractionDigits: 0,
        useGrouping: true,
      }),
    [locale]
  )
  const formatValue = useCallback(
    (n?: number): string => {
      if (n == null || !Number.isFinite(n)) return ''
      return formatter.format(n)
    },
    [formatter]
  )
  const [display, setDisplay] = useState(() => formatValue(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDisplay(formatValue(value))
  }, [formatValue, value])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      const num = allowNegative ? parseSignedRawDigits(raw) : parseRawDigits(raw)
      setDisplay(
        num !== undefined
          ? formatter.format(num)
          : raw.replace(/\D/g, '') === '' || (allowNegative && raw.trim() === '-')
            ? raw.trim() === '-'
              ? '-'
              : ''
            : ''
      )
      onChange(num)
    },
    [allowNegative, formatter, onChange]
  )

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    requestAnimationFrame(() => e.target.select())
  }, [])

  const handleBlur = useCallback(() => {
    const num = allowNegative ? parseSignedRawDigits(display) : parseRawDigits(display)
    setDisplay(formatValue(num))
  }, [allowNegative, display, formatValue])

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault()
      const pasted = e.clipboardData.getData('text')
      const num = allowNegative ? parseSignedRawDigits(pasted) : parseRawDigits(pasted)
      setDisplay(num ? formatter.format(num) : '')
      onChange(num)
    },
    [allowNegative, formatter, onChange]
  )

  return (
    <div className={className}>
      <AuroraInput
        ref={inputRef}
        id={resolvedId}
        name={name}
        type="text"
        inputMode={allowNegative ? 'text' : 'numeric'}
        label={label}
        value={display}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPaste={handlePaste}
        placeholder={placeholder}
        size={size}
        disabled={disabled}
        aria-label={ariaLabel}
        leftIcon={<span className="text-foreground/40 text-xs font-medium select-none">€</span>}
        rightIcon={rightIcon}
      />
    </div>
  )
}
