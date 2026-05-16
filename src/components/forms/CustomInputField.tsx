// 📝 Custom Input Field - Clarity Aurora Design System
// Reusable input field with floating label, validation states, and Clarity styling

import React from 'react'
import { AuroraInput } from '../../design-system/components/Input'
import { InfoIcon } from '../ui/InfoIcon'

export interface CustomInputFieldProps {
  label?: string
  type?: string
  placeholder?: string
  value?: string
  onChange?: (_e: React.ChangeEvent<HTMLInputElement>) => void
  onBlur?: (_e: React.FocusEvent<HTMLInputElement>) => void
  onFocus?: (_e: React.FocusEvent<HTMLInputElement>) => void
  onKeyDown?: (_e: React.KeyboardEvent<HTMLInputElement>) => void
  name?: string
  className?: string
  error?: string
  touched?: boolean
  required?: boolean
  disabled?: boolean
  autoFocus?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  description?: string
  autoComplete?: string
  inputRef?: React.RefObject<HTMLInputElement>
  helpText?: string
  helpTextPlacement?: 'tooltip' | 'below'
  /** When false, long floating labels wrap instead of ellipsis (matches AuroraInput) */
  truncateLabel?: boolean
}

const CustomInputField: React.FC<CustomInputFieldProps> = ({
  label = '',
  type = 'text',
  placeholder = '',
  value = '',
  onChange = () => undefined,
  onBlur = () => undefined,
  onFocus,
  onKeyDown,
  name = '',
  className = '',
  error,
  touched,
  required = false,
  disabled = false,
  autoFocus = false,
  leftIcon,
  rightIcon,
  description,
  autoComplete,
  inputRef,
  helpText,
  helpTextPlacement = 'tooltip',
  truncateLabel,
}) => {
  const effectiveRightIcon =
    helpText && helpTextPlacement === 'tooltip' ? (
      <InfoIcon content={helpText} position="left" maxWidth={300} size={24} className="ml-0" />
    ) : (
      rightIcon
    )

  return (
    <div className={className}>
      <AuroraInput
        label={label}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        name={name}
        error={error}
        touched={touched}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        leftIcon={leftIcon}
        rightIcon={effectiveRightIcon}
        description={description}
        autoComplete={autoComplete}
        inputRef={inputRef}
        helpText={helpText}
        helpTextPlacement={helpTextPlacement}
        truncateLabel={truncateLabel}
      />
    </div>
  )
}

export default CustomInputField
