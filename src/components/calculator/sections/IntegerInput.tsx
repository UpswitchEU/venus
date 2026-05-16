'use client'

import { useCallback, useEffect, useState } from 'react'
import { AuroraInput } from '@/design-system'

/**
 * Integer-only text input (stacked-label by default) for sub-sections
 * where the previous design used a raw `<input type="number">` that
 * looked visually different from the rest of the Aurora Clarity form.
 *
 * Stores `number | undefined`, displays digits-only, clamps to [min, max]
 * on blur, and rejects non-digit keystrokes via inputMode="numeric".
 *
 * Aurora Clarity rationale: dense finance forms (acquisition year,
 * economic useful life, etc.) need labels above the input so long
 * Dutch labels never overlap the value.
 */
export interface IntegerInputProps {
  label: string
  value?: number
  onChange: (value: number | undefined) => void
  placeholder?: string
  min?: number
  max?: number
  disabled?: boolean
  required?: boolean
  description?: string
  size?: 'sm' | 'md' | 'lg'
  /** When false, label renders above the input (recommended for long i18n). */
  truncateLabel?: boolean
  /** Right-aligned accessory on the label row (e.g. PrefilledBadge). */
  trailingLabelAccessory?: React.ReactNode
}

function parseInteger(raw: string): number | undefined {
  const digits = raw.replace(/[^\d-]/g, '')
  if (!digits || digits === '-') return undefined
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : undefined
}

function clamp(n: number, min?: number, max?: number): number {
  if (min != null && n < min) return min
  if (max != null && n > max) return max
  return n
}

export function IntegerInput({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
  disabled,
  required,
  description,
  size = 'sm',
  truncateLabel = false,
  trailingLabelAccessory,
}: IntegerInputProps) {
  const [display, setDisplay] = useState<string>(value != null ? String(value) : '')

  useEffect(() => {
    setDisplay(value != null ? String(value) : '')
  }, [value])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = parseInteger(e.target.value)
      setDisplay(parsed != null ? String(parsed) : '')
      onChange(parsed)
    },
    [onChange]
  )

  const handleBlur = useCallback(() => {
    const parsed = parseInteger(display)
    if (parsed == null) {
      setDisplay('')
      onChange(undefined)
      return
    }
    const clamped = clamp(parsed, min, max)
    setDisplay(String(clamped))
    if (clamped !== value) onChange(clamped)
  }, [display, min, max, value, onChange])

  return (
    <AuroraInput
      label={label}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      size={size}
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      description={description}
      truncateLabel={truncateLabel}
      trailingLabelAccessory={trailingLabelAccessory}
      className="tabular-nums"
    />
  )
}
