'use client'

import { useCallback, useEffect, useState } from 'react'
import { parseDecimalTextInput } from '@/utils/decimalTextInput'

/**
 * Controlled decimal text UX: draft while focused (trailing "." / comma decimals),
 * sync from `value` when blurred. Same behavior as AdaptivePercentInput.
 */
export function useDecimalTextInputState(
  value: number | undefined,
  onChange: (next: number | undefined) => void,
  options?: { readOnly?: boolean }
) {
  const readOnly = options?.readOnly ?? false
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState(() =>
    value != null && Number.isFinite(value) ? String(value) : ''
  )

  useEffect(() => {
    if (!focused) {
      setDraft(value != null && Number.isFinite(value) ? String(value) : '')
    }
  }, [value, focused])

  const handleFocus = useCallback(() => {
    if (readOnly) return
    setFocused(true)
    setDraft(value != null && Number.isFinite(value) ? String(value) : '')
  }, [readOnly, value])

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(false)
      const raw = e.target.value
      const parsed = parseDecimalTextInput(raw)
      if (raw.trim() !== '' && parsed === undefined) {
        setDraft(value != null && Number.isFinite(value) ? String(value) : '')
        return
      }
      onChange(parsed)
    },
    [onChange, value]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (readOnly) return
      const raw = e.target.value
      setDraft(raw)
      if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
        onChange(undefined)
        return
      }
      const parsed = parseDecimalTextInput(raw)
      if (parsed !== undefined) {
        onChange(parsed)
      }
    },
    [onChange, readOnly]
  )

  const display = focused ? draft : value != null && Number.isFinite(value) ? String(value) : ''

  return {
    display,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onChange: handleChange,
  }
}
