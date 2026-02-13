// 📝 Custom Input Field - Enhanced input with floating label
// Location: src/shared/components/forms/CustomInputField.tsx
// Purpose: Reusable input field with smooth animations and validation states

import React from 'react'
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
}

const CustomInputField: React.FC<CustomInputFieldProps> = ({
  label = '',
  type = 'text',
  placeholder = '',
  value = '',
  onChange = () => {
    // Default no-op handler
  },
  onBlur = () => {
    // Default no-op handler
  },
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
}) => {
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    onFocus?.(e)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    onBlur(e)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e)
  }

  const hasError = error && touched

  return (
    <div className={`relative ${className}`}>
      <div
        className={`relative custom-input-group border rounded-xl shadow-sm transition-all duration-200 ${
          disabled
            ? 'border-foreground/[0.05] bg-foreground/[0.02] opacity-60'
            : hasError
              ? 'border-destructive bg-foreground/[0.04] hover:border-destructive/80'
              : 'border-foreground/[0.10] bg-foreground/[0.04] hover:border-foreground/[0.20] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20'
        }`}
      >
        {leftIcon && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-foreground/50 z-10">
            {leftIcon}
          </div>
        )}

        <input
          ref={inputRef}
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || ' '}
          required={required}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          aria-invalid={hasError ? 'true' : 'false'}
          aria-describedby={hasError ? `${name}-error` : undefined}
          className={`
            w-full h-16 px-4 pt-6 pb-2 text-base 
            border-none rounded-xl 
            focus:outline-none focus:ring-0
            transition-all duration-200 ease-in-out
            placeholder:text-transparent
            ${leftIcon ? 'pl-10' : ''}
            ${rightIcon ? 'pr-10' : ''}
            ${hasError ? 'text-destructive' : ''}
            ${disabled ? 'bg-transparent cursor-not-allowed text-foreground/30' : 'bg-transparent text-foreground'}
          `}
        />

        {rightIcon && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-foreground/50 z-10">
            {rightIcon}
          </div>
        )}

        <label
          className={`
            absolute left-4 top-2 text-xs font-medium pointer-events-none
            ${hasError ? 'text-destructive' : 'text-foreground/50'}
            ${disabled ? 'text-foreground/30' : ''}
          `}
        >
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>

        {/* Info Icon - Positioned centered right */}
        {helpText && helpTextPlacement === 'tooltip' && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 mt-1 z-20 ${rightIcon ? 'right-12' : 'right-4'}`}
          >
            <InfoIcon
              content={helpText}
              position="left"
              maxWidth={300}
              size={24}
              className="ml-0"
            />
          </div>
        )}
      </div>

      {description && <p className="mt-1.5 text-xs text-foreground/50 font-medium">{description}</p>}

      {/* Help Text */}
      {helpText && helpTextPlacement === 'below' && !hasError && (
        <p className="text-xs text-foreground/50 mt-2 leading-relaxed">{helpText}</p>
      )}

      {hasError && (
        <p
          id={`${name}-error`}
          role="alert"
          className="mt-1.5 text-xs text-destructive font-medium flex items-start gap-1.5"
        >
          <span className="w-1 h-1 rounded-full bg-destructive inline-block mt-1.5 flex-shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}

export default CustomInputField
