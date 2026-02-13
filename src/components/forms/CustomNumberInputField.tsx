// 🔢 Custom Number Input Field - Clarity Aurora Design System
// Wraps AuroraNumberInput with Venus form field props

import React from 'react'
import { AuroraNumberInput } from '@/design-system'

export interface CustomNumberInputFieldProps {
  label: string
  placeholder: string
  value: string | number
  onChange: (_e: React.ChangeEvent<HTMLInputElement>) => void
  onBlur: (_e: React.FocusEvent<HTMLInputElement>) => void
  onFocus?: (_e: React.FocusEvent<HTMLInputElement>) => void
  name: string
  className?: string
  error?: string
  touched?: boolean
  inputRef?: React.RefObject<HTMLInputElement>
  required?: boolean
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  prefix?: string
  suffix?: string
  allowDecimals?: boolean
  formatAsCurrency?: boolean
  showArrows?: boolean
  helpText?: string
  helpTextPlacement?: 'tooltip' | 'below'
}

const CustomNumberInputField: React.FC<CustomNumberInputFieldProps> = ({
  label,
  placeholder,
  value,
  onChange,
  onBlur,
  onFocus,
  name,
  className = '',
  error,
  touched,
  inputRef,
  required = false,
  disabled = false,
  min,
  max,
  step = 1,
  prefix,
  suffix,
  allowDecimals = true,
  formatAsCurrency = false,
  showArrows = false,
  helpText,
  helpTextPlacement = 'tooltip',
}) => {
  return (
    <div className={className}>
      <AuroraNumberInput
        label={label}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onFocus={onFocus}
        name={name}
        error={error}
        touched={touched}
        inputRef={inputRef}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        prefix={prefix}
        suffix={suffix}
        allowDecimals={allowDecimals}
        formatAsCurrency={formatAsCurrency}
        showArrows={showArrows}
        helpText={helpText}
        helpTextPlacement={helpTextPlacement}
      />
    </div>
  )
}

export default CustomNumberInputField
