'use client'

import { AuroraInput } from '@/design-system/components/Input'
import { cn } from '@/design-system/utils'

interface AdaptivePercentInputProps {
  label: string
  value?: number
  onChange: (value: number | undefined) => void
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  description?: string
  step?: string
}

export function AdaptivePercentInput({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  readOnly,
  description,
  step,
}: AdaptivePercentInputProps) {
  return (
    <AuroraInput
      label={label}
      type="number"
      size="sm"
      value={value != null ? String(value) : ''}
      onChange={(e) => {
        if (readOnly) return
        const raw = e.target.value
        if (raw === '') {
          onChange(undefined)
          return
        }
        const parsed = Number.parseFloat(raw)
        if (!Number.isNaN(parsed)) onChange(parsed)
      }}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      description={description}
      step={step}
      className={cn(
        'tabular-nums',
        readOnly && 'cursor-default',
        '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
      )}
    />
  )
}
