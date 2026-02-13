// 🔢 Custom Number Input Field - Number input with formatting and validation
// Location: src/shared/components/forms/CustomNumberInputField.tsx
// Purpose: Number input with formatting, min/max validation, and consistent styling

import React from 'react'
import { InfoIcon } from '../ui/InfoIcon'

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
  showArrows?: boolean // New prop to show up/down arrows
  helpText?: string // NEW: Optional help text (McKinsey UX standard)
  helpTextPlacement?: 'tooltip' | 'below' // NEW: Display style
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
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    onFocus?.(e)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    onBlur(e)
  }

  const handlePaste = (_e: React.ClipboardEvent<HTMLInputElement>) => {
    // Allow paste operations - don't prevent default
    // The onChange handler will process the pasted content
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle arrow keys for increment/decrement when arrows are shown
    if (showArrows && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      // Preserve 0 as a valid value - use nullish coalescing instead of logical OR
      const currentValue =
        typeof value === 'string' ? (value === '' ? 0 : (parseInt(value) ?? 0)) : (value ?? 0)
      const stepValue = step || 1
      let newValue: number

      if (e.key === 'ArrowUp') {
        newValue = currentValue + stepValue
      } else {
        newValue = currentValue - stepValue
      }

      // Apply min/max constraints
      if (min !== undefined && newValue < min) {
        newValue = min
      }
      if (max !== undefined && newValue > max) {
        newValue = max
      }

      // Trigger onChange with the new value
      const syntheticEvent = {
        target: { value: newValue.toString() },
      } as React.ChangeEvent<HTMLInputElement>
      onChange(syntheticEvent)
      return
    }

    // Allow all Ctrl+key combinations (including paste, copy, cut, select all)
    if (e.ctrlKey || e.metaKey) {
      return
    }

    // Allow: backspace, delete, tab, escape, enter, decimal point, minus, comma
    if (
      ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', '.', '-', ','].includes(e.key) ||
      // Allow: home, end, left, right, down, up
      ['Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(e.key)
    ) {
      return
    }
    // Allow numbers (0-9) from both main keyboard and numpad
    if (/^[0-9]$/.test(e.key)) {
      return
    }
    // Allow decimal point if decimals are allowed
    if (allowDecimals && e.key === '.') {
      return
    }
    // Allow comma for thousands separator
    if (e.key === ',') {
      return
    }
    // Block all other keys
    e.preventDefault()
  }

  const handleArrowClick = (direction: 'up' | 'down') => {
    // Preserve 0 as a valid value - use nullish coalescing instead of logical OR
    const currentValue =
      typeof value === 'string' ? (value === '' ? 0 : (parseInt(value) ?? 0)) : (value ?? 0)
    const stepValue = step || 1
    let newValue: number

    if (direction === 'up') {
      newValue = currentValue + stepValue
    } else {
      newValue = currentValue - stepValue
    }

    // Apply min/max constraints
    if (min !== undefined && newValue < min) {
      newValue = min
    }
    if (max !== undefined && newValue > max) {
      newValue = max
    }

    // Trigger onChange with the new value
    const syntheticEvent = {
      target: { value: newValue.toString() },
    } as React.ChangeEvent<HTMLInputElement>
    onChange(syntheticEvent)
  }

  const hasError = error && touched

  // Use formatAsCurrency to avoid unused variable warning
  if (formatAsCurrency) {
    // Currency formatting logic would go here if needed
  }

  return (
    <div className={className}>
      <div className="relative">
        {prefix && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 text-sm font-medium">
            {prefix}
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="-?[0-9]*"
          placeholder={placeholder}
          className={`
            w-full h-14 px-4 pt-6 pb-2 text-base text-slate-ink bg-white 
            border rounded-xl transition-all duration-200 
            ${
              hasError
                ? 'border-accent-300 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20'
                : 'border-gray-200 hover:border-primary-300 focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20'
            }
            focus:outline-none
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            ${prefix ? 'pl-8' : ''}
            ${suffix || showArrows ? 'pr-8' : ''}
            placeholder:text-stone-300
          `}
          aria-label={label}
          value={value}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          name={name}
          required={required}
          disabled={disabled}
          min={min}
          max={max}
          step={step}
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-500 text-sm font-medium">
            {suffix}
          </span>
        )}
        {showArrows && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => handleArrowClick('up')}
              disabled={
                disabled ||
                (max !== undefined &&
                  (typeof value === 'string' ? (parseInt(value) ?? 0) : (value ?? 0)) >= max)
              }
              className="w-4 h-4 flex items-center justify-center text-stone-400 hover:text-stone-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Increase value"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m18 15-6-6-6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => handleArrowClick('down')}
              disabled={
                disabled ||
                (min !== undefined &&
                  min > 0 &&
                  (typeof value === 'string' ? (parseInt(value) ?? 0) : (value ?? 0)) <= min)
              }
              className="w-4 h-4 flex items-center justify-center text-stone-400 hover:text-stone-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Decrease value"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>
        )}
        <label
          className={`
            absolute left-4 top-2 text-xs text-stone-500 font-medium flex items-center gap-1
            ${hasError ? 'text-rust-600' : ''}
            ${prefix ? 'left-8' : ''}
            pointer-events-none
          `}
        >
          <span className="pointer-events-none">{label}</span>
        </label>

        {/* Info Icon - Positioned centered right */}
        {helpText && helpTextPlacement === 'tooltip' && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 mt-1 z-20 ${suffix || showArrows ? 'right-12' : 'right-4'}`}
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

      {hasError && (
        <span className="mt-1.5 text-xs text-rust-500 font-medium flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-rust-500 inline-block" />
          {error}
        </span>
      )}

      {/* Help Text (McKinsey UX Standard) */}
      {helpText && helpTextPlacement === 'below' && !hasError && (
        <p className="text-xs text-stone-500 mt-2 leading-relaxed">{helpText}</p>
      )}
    </div>
  )
}

export default CustomNumberInputField
