'use client'

import { AuroraInput } from '@/design-system/components/Input'
import { cn } from '@/design-system/utils'
import { useDecimalTextInputState } from '@/hooks/useDecimalTextInputState'
import { normalizeDecimalSeparators, parseDecimalTextInput } from '@/utils/decimalTextInput'

export const normalizePercentDecimalInput = normalizeDecimalSeparators
export const parseAdaptivePercentInput = parseDecimalTextInput

interface AdaptivePercentInputProps {
  label: string
  value?: number
  onChange: (value: number | undefined) => void
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  description?: string
  /** Ignored for text inputs; kept for API compatibility with callers that pass `step`. */
  step?: string
  /** When false, long floating labels wrap instead of ellipsis */
  truncateLabel?: boolean
  required?: boolean
  /** Matches AuroraInput / CurrencyInput density in the same form row */
  size?: 'sm' | 'md' | 'lg'
  /** Pass-through to AuroraInput (stacked-label mode only). */
  trailingLabelAccessory?: React.ReactNode
}

export function AdaptivePercentInput({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  readOnly,
  description,
  truncateLabel,
  required,
  size = 'sm',
  trailingLabelAccessory,
  step: _step,
}: AdaptivePercentInputProps) {
  const {
    display,
    onFocus,
    onBlur,
    onChange: onDecChange,
  } = useDecimalTextInputState(value, onChange, { readOnly })

  return (
    <AuroraInput
      label={label}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      size={size}
      value={display}
      onChange={onDecChange}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      description={description}
      truncateLabel={truncateLabel}
      required={required}
      trailingLabelAccessory={trailingLabelAccessory}
      className={cn(
        'tabular-nums',
        readOnly && 'cursor-default',
        '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
      )}
    />
  )
}
