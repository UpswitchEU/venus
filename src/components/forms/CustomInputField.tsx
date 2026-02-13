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
            ? 'border-gray-200 bg-gray-50'
            : hasError
              ? 'border-accent-300 bg-white hover:border-accent-400 focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/20'
              : 'border-gray-200 bg-white hover:border-primary-300 focus-within:border-primary-600 focus-within:ring-2 focus-within:ring-primary-500/20'
        }`}
      >
        {leftIcon && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 z-10">
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
            w-full h-14 px-4 pt-6 pb-2 text-base 
            border-none rounded-xl 
            focus:outline-none focus:ring-0
            transition-all duration-200 ease-in-out
            ${leftIcon ? 'pl-10' : ''}
            ${rightIcon ? 'pr-10' : ''}
            ${hasError ? 'text-rust-600' : ''}
            ${disabled ? 'bg-transparent cursor-not-allowed text-gray-400' : 'bg-transparent text-slate-ink'}
          `}
        />

        {rightIcon && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 z-10">
            {rightIcon}
          </div>
        )}

        <label
          className={`
            absolute left-4 top-2 text-xs text-stone-500 font-medium pointer-events-none
            ${hasError ? 'text-rust-500' : ''}
            ${disabled ? 'text-stone-300' : ''}
          `}
        >
          {label}
          {required && <span className="text-rust-500 ml-1">*</span>}
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

      {description && <p className="mt-1.5 text-xs text-stone-500 font-medium">{description}</p>}

      {/* Help Text (McKinsey UX Standard) */}
      {helpText && helpTextPlacement === 'below' && !hasError && (
        <p className="text-xs text-stone-500 mt-2 leading-relaxed">{helpText}</p>
      )}

      {hasError && (
        <p
          id={`${name}-error`}
          role="alert"
          className="mt-1.5 text-xs text-rust-600 font-medium flex items-start gap-1.5 animate-in fade-in slide-in-from-top-1"
        >
          <span className="w-1 h-1 rounded-full bg-rust-500 inline-block mt-1.5 flex-shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}

export default CustomInputField
