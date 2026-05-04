/**
 * Aurora Design System
 * NumberInput Component
 *
 * Wrapper around AuroraInput with number-specific features:
 * - Prefix/suffix support (e.g., € or %)
 * - Increment/decrement arrows
 * - Currency formatting
 * - Min/max constraints
 *
 * Compatible with legacy CustomNumberInputField props.
 */

import { cva } from 'class-variance-authority'
import { motion } from 'framer-motion'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/utils'

// ─────────────────────────────────────────
// STYLE VARIANTS
// ─────────────────────────────────────────

const inputGroupVariants = cva(
  ['relative border rounded-xl shadow-sm transition-all duration-200', 'bg-foreground/[0.04]'],
  {
    variants: {
      state: {
        default: 'border-foreground/[0.10] hover:border-foreground/[0.20]',
        focus: 'border-primary ring-2 ring-primary/20 ring-offset-0',
        error: 'border-destructive',
        disabled: 'border-foreground/[0.05] opacity-60 cursor-not-allowed',
      },
    },
    defaultVariants: {
      state: 'default',
    },
  }
)

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface AuroraNumberInputProps {
  label: string
  placeholder?: string
  value: string | number
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void
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
  size?: 'sm' | 'md' | 'lg'
}

// ─────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────

export const AuroraNumberInput = React.forwardRef<HTMLInputElement, AuroraNumberInputProps>(
  (
    {
      label,
      placeholder = '',
      value,
      onChange,
      onBlur,
      onFocus,
      name,
      className,
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
      size = 'md',
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = React.useState(false)
    const [showTooltip, setShowTooltip] = React.useState(false)
    const internalRef = React.useRef<HTMLInputElement>(null)
    const actualRef = inputRef || internalRef

    React.useImperativeHandle(ref, () => actualRef.current!)

    const hasError = error && touched
    const hasValue = value !== '' && value !== undefined && value !== null

    const state = disabled ? 'disabled' : hasError ? 'error' : isFocused ? 'focus' : 'default'

    const isFloated = isFocused || hasValue

    const numericFromInput = (v: string | number): number => {
      if (typeof v === 'number') return Number.isFinite(v) ? v : 0
      if (v === '') return 0
      const n = parseFloat(v)
      return Number.isFinite(n) ? n : 0
    }

    // Handle arrow click
    const handleArrowClick = (direction: 'up' | 'down') => {
      const currentValue = numericFromInput(value)
      let newValue: number

      if (direction === 'up') {
        newValue = currentValue + step
      } else {
        newValue = currentValue - step
      }

      // Apply constraints
      if (min !== undefined && newValue < min) newValue = min
      if (max !== undefined && newValue > max) newValue = max

      const syntheticEvent = {
        target: { value: newValue.toString(), name },
      } as React.ChangeEvent<HTMLInputElement>
      onChange(syntheticEvent)
    }

    // Handle keyboard
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (showArrows && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        handleArrowClick(e.key === 'ArrowUp' ? 'up' : 'down')
        return
      }

      // Allow control keys
      if (e.ctrlKey || e.metaKey) return

      // Allow navigation and editing keys
      if (
        [
          'Backspace',
          'Delete',
          'Tab',
          'Escape',
          'Enter',
          'Home',
          'End',
          'ArrowLeft',
          'ArrowRight',
        ].includes(e.key)
      ) {
        return
      }

      // Allow numbers
      if (/^[0-9]$/.test(e.key)) return

      // Allow decimal if permitted
      if (allowDecimals && (e.key === '.' || e.key === ',')) return

      // Allow negative sign
      if (e.key === '-') return

      e.preventDefault()
    }

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true)
      onFocus?.(e)
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false)
      onBlur?.(e)
    }

    // Size classes
    const sizeClasses = {
      sm: 'h-14',
      md: 'h-16',
      lg: 'h-[72px]',
    }

    const labelSizeClasses = {
      sm: isFloated ? 'top-2 text-xs' : 'top-4 text-sm',
      md: isFloated ? 'top-2 text-xs' : 'top-5 text-base',
      lg: isFloated ? 'top-2.5 text-xs' : 'top-6 text-lg',
    }

    const inputPaddingClasses = {
      sm: 'pt-6 pb-2',
      md: 'pt-6 pb-2',
      lg: 'pt-7 pb-2',
    }

    return (
      <div className={cn('relative w-full', className)}>
        <div className={cn(inputGroupVariants({ state }), sizeClasses[size])}>
          {/* Prefix */}
          {prefix && (
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/50 text-sm font-medium z-10">
              {prefix}
            </span>
          )}

          {/* Input */}
          <input
            ref={actualRef}
            type="text"
            inputMode="decimal"
            name={name}
            value={value}
            onChange={onChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            required={required}
            placeholder=" "
            className={cn(
              'w-full h-full border-none rounded-xl bg-transparent',
              'focus:outline-none focus:ring-0',
              'transition-all duration-200 ease-in-out',
              'placeholder:text-transparent text-foreground',
              'disabled:cursor-not-allowed',
              'px-4',
              inputPaddingClasses[size],
              prefix && 'pl-10',
              (suffix || showArrows || (helpText && helpTextPlacement === 'tooltip')) && 'pr-16'
            )}
            aria-invalid={Boolean(hasError)}
            aria-required={required}
          />

          {/* Floating Label */}
          <label
            htmlFor={name}
            className={cn(
              'absolute transition-all duration-200 ease-in-out pointer-events-none origin-left font-medium',
              prefix ? 'left-10' : 'left-4',
              labelSizeClasses[size],
              hasError ? 'text-destructive' : isFocused ? 'text-primary' : 'text-foreground/70'
            )}
          >
            {label}
            {required && <span className="text-destructive ml-0.5">*</span>}
          </label>

          {/* Right side controls */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {/* Help tooltip */}
            {helpText && helpTextPlacement === 'tooltip' && (
              <div
                className="relative"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
              >
                <button
                  type="button"
                  className="p-1 rounded-full text-foreground/40 hover:text-foreground/60 transition-colors"
                  aria-label="Help"
                >
                  <Info className="w-4 h-4" />
                </button>
                {showTooltip && (
                  <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-background border border-foreground/10 rounded-lg shadow-lg text-xs text-foreground/70 z-50">
                    {helpText}
                  </div>
                )}
              </div>
            )}

            {/* Suffix */}
            {suffix && <span className="text-foreground/50 text-sm font-medium">{suffix}</span>}

            {/* Arrows */}
            {showArrows && (
              <div className="flex flex-col gap-0">
                <button
                  type="button"
                  onClick={() => handleArrowClick('up')}
                  disabled={disabled || (max !== undefined && Number(value) >= max)}
                  className="p-0.5 text-foreground/40 hover:text-foreground/70 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Increase"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleArrowClick('down')}
                  disabled={disabled || (min !== undefined && Number(value) <= min)}
                  className="p-0.5 text-foreground/40 hover:text-foreground/70 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Decrease"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Help Text (below) */}
        {helpText && helpTextPlacement === 'below' && !hasError && (
          <p className="text-xs text-foreground/50 mt-2 leading-relaxed">{helpText}</p>
        )}

        {/* Error Message */}
        {hasError && (
          <p className="mt-1 text-sm text-destructive flex items-start gap-1.5" role="alert">
            <span className="w-1 h-1 rounded-full bg-destructive inline-block mt-1.5 flex-shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    )
  }
)

AuroraNumberInput.displayName = 'AuroraNumberInput'

export default AuroraNumberInput
