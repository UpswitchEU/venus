/**
 * 🔒 Custom Password Input Field
 *
 * Password input field with show/hide toggle functionality
 */

import { Eye, EyeOff } from 'lucide-react'
import React, { useState } from 'react'
import CustomInputField from '../../../components/forms/CustomInputField'

export interface CustomPasswordInputFieldProps {
  label?: string
  placeholder?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
  name?: string
  className?: string
  error?: string
  touched?: boolean
  required?: boolean
  disabled?: boolean
  autoFocus?: boolean
  description?: string
  autoComplete?: string
}

const CustomPasswordInputField: React.FC<CustomPasswordInputFieldProps> = ({
  label = 'Password',
  placeholder = 'Enter password',
  value = '',
  onChange = () => {
    // Default no-op handler
  },
  onBlur = () => {
    // Default no-op handler
  },
  name = 'password',
  className = '',
  error,
  touched,
  required = false,
  disabled = false,
  autoFocus = false,
  description,
  autoComplete = 'current-password',
}) => {
  const [showPassword, setShowPassword] = useState(false)

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword)
  }

  return (
    <CustomInputField
      label={label}
      type={showPassword ? 'text' : 'password'}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      name={name}
      className={className}
      error={error}
      touched={touched}
      required={required}
      disabled={disabled}
      autoFocus={autoFocus}
      description={description}
      autoComplete={autoComplete}
      rightIcon={
        <button
          type="button"
          onClick={togglePasswordVisibility}
          className="text-muted-foreground hover:text-foreground transition-colors duration-200"
          disabled={disabled}
        >
          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      }
    />
  )
}

export default CustomPasswordInputField
