// 📋 Custom Dropdown Component - Clarity Aurora Design System
// Wraps AuroraSelect with Venus form field props

import React from 'react'
import { AuroraSelect } from '@/design-system'
import { InfoIcon } from '../ui/InfoIcon'

interface DropdownOption {
  value: string
  label: string
  disabled?: boolean
}

interface CustomDropdownProps {
  label: string
  placeholder?: string
  options: DropdownOption[]
  value?: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  error?: string
  touched?: boolean
  name?: string
  className?: string
  dropdownRef?: React.RefObject<HTMLDivElement>
  helpText?: string
  helpTextPlacement?: 'tooltip' | 'below'
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({
  label,
  placeholder = 'Select an option',
  options,
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  touched = false,
  name,
  className = '',
  dropdownRef,
  helpText,
  helpTextPlacement = 'tooltip',
}) => {
  const selectOptions = options.map((opt) => ({
    value: opt.value,
    label: opt.label,
    disabled: opt.disabled,
  }))

  return (
    <div className={`relative ${className}`}>
      {helpText && helpTextPlacement === 'tooltip' && (
        <div className="absolute right-12 top-1/2 -translate-y-1/2 z-10 pointer-events-auto">
          <InfoIcon content={helpText} position="left" maxWidth={300} size={24} className="ml-0" />
        </div>
      )}
      <AuroraSelect
        label={label}
        placeholder={placeholder}
        options={selectOptions}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        error={error}
        touched={touched}
        name={name}
        dropdownRef={dropdownRef}
        helpText={helpTextPlacement === 'below' ? helpText : undefined}
        helpTextPlacement="below"
      />
    </div>
  )
}

export default CustomDropdown
