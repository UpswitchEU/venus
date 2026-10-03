'use client'

import { useLocale } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { parseDecimalTextInput } from '@/utils/decimalTextInput'
import { FinancialDecimal } from '@/utils/financialDecimal'

/**
 * Controlled decimal text UX: draft while focused (trailing "." / comma decimals),
 * sync from `value` when blurred. Same behavior as AdaptivePercentInput.
 */
export function useDecimalTextInputState(
  value: number | undefined,
  onChange: (next: number | undefined) => void,
  options?: { readOnly?: boolean; allowNegative?: boolean; useGrouping?: boolean }
) {
  const readOnly = options?.readOnly ?? false
  const allowNegative = options?.allowNegative ?? true
  const useGrouping = options?.useGrouping ?? false
  const locale = useLocale()
  const inputLocale = locale === 'en' ? 'en' : locale === 'fr' ? 'fr' : 'nl'
  const format = useCallback(
    (n: number | undefined) =>
      n != null && Number.isFinite(n)
        ? useGrouping
          ? new Intl.NumberFormat(inputLocale === 'en' ? 'en-GB' : `${inputLocale}-BE`, {
              useGrouping: true,
              maximumFractionDigits: 8,
            }).format(n)
          : inputLocale === 'en'
            ? new FinancialDecimal(n).toFixed()
            : new FinancialDecimal(n).toFixed().replace('.', ',')
        : '',
    [inputLocale, useGrouping]
  )
  const [invalid, setInvalid] = useState(false)
  const validationMessage =
    inputLocale === 'nl'
      ? 'Voer een geldig getal in.'
      : inputLocale === 'fr'
        ? 'Saisissez un nombre valide.'
        : 'Enter a valid number.'
  const error = invalid ? validationMessage : undefined
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState(() => format(value))

  useEffect(() => {
    if (!focused && !invalid) {
      setDraft(format(value))
    }
  }, [value, focused, invalid, format])

  const handleFocus = useCallback(() => {
    if (readOnly) return
    setFocused(true)
    if (!invalid) setDraft(format(value))
  }, [readOnly, value, format, invalid])

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      if (readOnly) return
      setFocused(false)
      const raw = e.target.value
      const parsed = parseDecimalTextInput(raw, inputLocale)
      const bad = raw.trim() !== '' && (parsed === undefined || (!allowNegative && parsed < 0))
      setInvalid(bad)
      e.target.setCustomValidity(bad ? validationMessage : '')
      onChange(bad ? undefined : parsed)
    },
    [onChange, inputLocale, validationMessage, allowNegative, readOnly]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (readOnly) return
      const raw = e.target.value
      setDraft(raw)
      const parsed = parseDecimalTextInput(raw, inputLocale)
      const bad = raw.trim() !== '' && (parsed === undefined || (!allowNegative && parsed < 0))
      setInvalid(bad)
      e.target.setCustomValidity(bad ? validationMessage : '')
      onChange(bad ? undefined : parsed)
    },
    [onChange, readOnly, inputLocale, allowNegative, validationMessage]
  )

  const display = focused || invalid ? draft : format(value)

  return {
    display,
    error,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onChange: handleChange,
  }
}
