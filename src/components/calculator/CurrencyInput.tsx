'use client'

/**
 * Currency entry with explicit locale parsing and lossless numeric compatibility.
 */

import { useLocale } from 'next-intl'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AuroraInput } from '@/design-system'
import { parseDecimalTextInput } from '@/utils/decimalTextInput'

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
  description?: string
  /** When false, long floating labels wrap instead of ellipsis */
  truncateLabel?: boolean
  /** Shows required asterisk on floating label (maps to `required` on the input). */
  required?: boolean
  /** Pass-through to AuroraInput (stacked-label mode only). */
  trailingLabelAccessory?: React.ReactNode
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
  description,
  truncateLabel,
  required,
  trailingLabelAccessory,
}: CurrencyInputProps) {
  const locale = useLocale()
  const inputId = useId()
  const resolvedId = id ?? name ?? inputId
  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'fr' ? 'fr-BE' : locale === 'en' ? 'en-GB' : 'nl-BE', {
        maximumFractionDigits: 8,
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
  const [editing, setEditing] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const inputLocale = locale === 'en' ? 'en' : locale === 'fr' ? 'fr' : 'nl'
  const validationMessage =
    inputLocale === 'nl'
      ? 'Voer een geldig bedrag in zonder verlies van precisie.'
      : inputLocale === 'fr'
        ? 'Saisissez un montant valide sans perte de précision.'
        : 'Enter a valid amount without loss of precision.'
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing && !invalid) setDisplay(formatValue(value))
  }, [editing, invalid, formatValue, value])

  const commitDraft = useCallback(
    (raw: string) => {
      const num = parseDecimalTextInput(raw, inputLocale)
      const isInvalid = raw.trim() !== '' && (num === undefined || (!allowNegative && num < 0))
      setEditing(true)
      setDisplay(raw)
      setInvalid(isInvalid)
      inputRef.current?.setCustomValidity(isInvalid ? validationMessage : '')
      onChange(isInvalid ? undefined : num)
    },
    [allowNegative, inputLocale, onChange, validationMessage]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      commitDraft(e.target.value)
    },
    [commitDraft]
  )

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    setEditing(true)
    requestAnimationFrame(() => e.target.select())
  }, [])

  const handleBlur = useCallback(() => {
    setEditing(false)
    if (!invalid) setDisplay(formatValue(parseDecimalTextInput(display, inputLocale)))
  }, [display, formatValue, inputLocale, invalid])

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault()
      commitDraft(e.clipboardData.getData('text'))
    },
    [commitDraft]
  )

  return (
    <div className={className}>
      <AuroraInput
        ref={inputRef}
        id={resolvedId}
        name={name}
        type="text"
        inputMode="decimal"
        label={label}
        value={display}
        error={invalid ? validationMessage : undefined}
        touched={invalid}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPaste={handlePaste}
        placeholder={placeholder}
        size={size}
        disabled={disabled}
        aria-label={ariaLabel}
        description={description}
        truncateLabel={truncateLabel}
        required={required}
        trailingLabelAccessory={trailingLabelAccessory}
        leftIcon={<span className="text-foreground/40 text-xs font-medium select-none">€</span>}
        rightIcon={rightIcon}
      />
    </div>
  )
}
