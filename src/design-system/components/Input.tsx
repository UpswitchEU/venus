/**
 * Input Component Set - Aurora Design System
 *
 * Premium floating-label inputs following Hybrid Aurora patterns
 * with text, password, search, and textarea variants.
 *
 * Compatible with existing Venus form field props.
 */

import { cva, type VariantProps } from 'class-variance-authority'
import { motion } from 'framer-motion'
import { CircleCheck, CircleX, Eye, EyeOff, Search, X } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/utils'
import {
  deriveFieldVisualState,
  deriveHasFieldValue,
  getFieldErrorId,
  hasVisibleFieldError,
  useFieldErrorShake,
} from './Input.fieldState'
import { InputFeedback } from './InputFeedback'

// ─────────────────────────────────────────
// ANIMATION VARIANTS
// ─────────────────────────────────────────

const shakeAnimation = {
  shake: {
    x: [0, -8, 8, -8, 8, -4, 4, 0],
    transition: { duration: 0.5, ease: 'easeInOut' as const },
  },
}

// ─────────────────────────────────────────
// STYLE VARIANTS
// ─────────────────────────────────────────

const inputContainerVariants = cva('relative w-full transition-all duration-200', {
  variants: {
    size: {
      sm: '',
      md: '',
      lg: '',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

const inputGroupVariants = cva(
  ['relative border rounded-xl shadow-sm transition-all duration-200', 'bg-foreground/[0.04]'],
  {
    variants: {
      state: {
        default: 'border-foreground/[0.10] hover:border-foreground/[0.20]',
        focus: 'border-primary ring-2 ring-primary/20 ring-offset-0',
        error: 'border-destructive',
        success: 'border-primary',
        disabled: 'border-foreground/[0.05] opacity-60 cursor-not-allowed',
      },
      size: {
        sm: '',
        md: '',
        lg: '',
      },
    },
    defaultVariants: {
      state: 'default',
      size: 'md',
    },
  }
)

const inputFieldVariants = cva(
  [
    'w-full border-none rounded-xl',
    'bg-transparent',
    'focus:outline-none focus:ring-0',
    'transition-all duration-200 ease-in-out',
    'placeholder:text-transparent',
    'text-foreground',
    'disabled:cursor-not-allowed',
  ],
  {
    variants: {
      size: {
        sm: 'h-14 px-4 pt-6 pb-2 text-sm',
        md: 'h-16 px-4 pt-6 pb-2 text-base',
        lg: 'h-[72px] px-4 pt-7 pb-2 text-lg',
      },
      hasIcon: {
        true: '',
        false: '',
      },
      iconPosition: {
        left: '',
        right: '',
      },
    },
    compoundVariants: [
      { hasIcon: true, iconPosition: 'left', size: 'sm', className: 'pl-10' },
      { hasIcon: true, iconPosition: 'left', size: 'md', className: 'pl-11' },
      { hasIcon: true, iconPosition: 'left', size: 'lg', className: 'pl-12' },
      { hasIcon: true, iconPosition: 'right', size: 'sm', className: 'pr-10' },
      { hasIcon: true, iconPosition: 'right', size: 'md', className: 'pr-10' },
      { hasIcon: true, iconPosition: 'right', size: 'lg', className: 'pr-12' },
    ],
    defaultVariants: {
      size: 'md',
      hasIcon: false,
      iconPosition: 'right',
    },
  }
)

const floatingLabelVariants = cva(
  ['absolute left-4 transition-all duration-200 ease-in-out pointer-events-none', 'origin-left'],
  {
    variants: {
      state: {
        default: 'text-foreground/70',
        focus: 'text-primary',
        error: 'text-destructive',
        success: 'text-primary',
        disabled: 'text-foreground/30',
      },
      floated: {
        true: '',
        false: '',
      },
      size: {
        sm: '',
        md: '',
        lg: '',
      },
    },
    compoundVariants: [
      // Small - not floated (vertically centered in h-14)
      { floated: false, size: 'sm', className: 'top-4 text-sm' },
      // Small - floated
      { floated: true, size: 'sm', className: 'top-2 text-xs font-medium' },
      // Medium - not floated (vertically centered in h-16)
      { floated: false, size: 'md', className: 'top-5 text-base' },
      // Medium - floated
      { floated: true, size: 'md', className: 'top-2 text-xs font-medium' },
      // Large - not floated (vertically centered in h-[72px])
      { floated: false, size: 'lg', className: 'top-6 text-lg' },
      // Large - floated
      { floated: true, size: 'lg', className: 'top-2.5 text-xs font-medium' },
    ],
    defaultVariants: {
      state: 'default',
      floated: false,
      size: 'md',
    },
  }
)

// ─────────────────────────────────────────
// COMPONENT TYPES
// ─────────────────────────────────────────

export interface AuroraInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputFieldVariants> {
  /** Floating label text */
  label?: string
  /** Error message (sets error state automatically) */
  error?: string
  /** Whether the field has been touched (for showing errors) */
  touched?: boolean
  /** Success state */
  success?: boolean
  /** Left icon */
  leftIcon?: React.ReactNode
  /** Right icon (overridden by state icons) */
  rightIcon?: React.ReactNode
  /** Show clear button when input has value */
  clearable?: boolean
  /** Callback when clear button clicked */
  onClear?: () => void
  /** Container className */
  containerClassName?: string
  /** Help text */
  helpText?: string
  /** Help text placement */
  helpTextPlacement?: 'tooltip' | 'below'
  /** Description text below input */
  description?: string
  /** Input ref */
  inputRef?: React.RefObject<HTMLInputElement>
  /**
   * When false, the label renders ABOVE the input as a stacked block label
   * (Aurora Clarity dense-form pattern). Use for long finance / accountant
   * labels where the default floating treatment would clip or overlap the
   * value. Defaults to `true` (floating label).
   */
  truncateLabel?: boolean
  /**
   * Optional accessory rendered on the right side of a stacked label (e.g.
   * a "Prefilled" badge, info trigger, or unit hint). Only shown in
   * stacked-label mode (`truncateLabel={false}`); ignored when the label
   * floats inside the input.
   */
  trailingLabelAccessory?: React.ReactNode
}

export interface PasswordInputProps extends Omit<AuroraInputProps, 'type'> {
  /** Show password strength indicator */
  showStrength?: boolean
}

export interface SearchInputProps extends Omit<AuroraInputProps, 'type' | 'leftIcon'> {
  /** Callback for search action */
  onSearch?: (value: string) => void
}

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'>,
    VariantProps<typeof inputFieldVariants> {
  /** Floating label text */
  label?: string
  /** Error message */
  error?: string
  /** Whether the field has been touched */
  touched?: boolean
  /** Success state */
  success?: boolean
  /** Container className */
  containerClassName?: string
  /** Auto-resize based on content */
  autoResize?: boolean
  /** Help text */
  helpText?: string
  /** Help text placement */
  helpTextPlacement?: 'tooltip' | 'below'
}

// ─────────────────────────────────────────
// INPUT COMPONENT
// ─────────────────────────────────────────

const AuroraInput = React.forwardRef<HTMLInputElement, AuroraInputProps>(
  (
    {
      className,
      containerClassName,
      label,
      error,
      touched,
      success,
      size = 'md',
      leftIcon,
      rightIcon,
      clearable,
      onClear,
      disabled,
      required,
      value,
      defaultValue,
      onFocus,
      onBlur,
      helpText,
      helpTextPlacement = 'below',
      description,
      inputRef,
      truncateLabel = true,
      trailingLabelAccessory,
      placeholder: placeholderProp,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = React.useState(false)
    const [hasValue, setHasValue] = React.useState(false)
    const internalRef = React.useRef<HTMLInputElement>(null)

    // Use inputRef or internal ref
    const actualRef = inputRef || internalRef

    // Combine refs
    React.useImperativeHandle(ref, () => actualRef.current as HTMLInputElement)

    // Sync hasValue with actual input value on mount and when value/defaultValue changes
    React.useEffect(() => {
      setHasValue(
        deriveHasFieldValue({
          value,
          defaultValue,
          elementValue: actualRef.current?.value,
        })
      )
    }, [value, defaultValue, actualRef])

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true)
      onFocus?.(e)
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false)
      setHasValue(Boolean(e.target.value))
      onBlur?.(e)
    }

    const handleClear = () => {
      if (actualRef.current) {
        actualRef.current.value = ''
        actualRef.current.focus()
        setHasValue(false)
        onClear?.()
      }
    }

    const hasError = hasVisibleFieldError(error, touched)
    const state = deriveFieldVisualState({ disabled, hasError, isFocused, success })
    const shouldShake = useFieldErrorShake(hasError)
    const fieldId = props.id || props.name
    const errorId = getFieldErrorId(fieldId)

    const shouldTruncateLabel = truncateLabel
    /**
     * Stacked-label mode: when `truncateLabel={false}`, render the label as
     * a block element ABOVE the input instead of as a floating label inside.
     * This is the Aurora Clarity pattern for dense finance/accountant forms
     * where labels are long and the floating treatment would clip or
     * overlap the value.
     */
    const useStackedLabel = label != null && !shouldTruncateLabel
    /** Floating-label state only matters when we're rendering one. */
    const isLabelFloated = isFocused || hasValue
    const hasLeftIcon = Boolean(leftIcon)
    const showClearButton = clearable && hasValue && !disabled
    const showStateIcon = (hasError || success) && !showClearButton
    const stackedLabelState = disabled
      ? 'text-foreground/40'
      : hasError
        ? 'text-destructive'
        : isFocused
          ? 'text-primary'
          : 'text-foreground/70'

    return (
      <div className={cn(inputContainerVariants({ size }), containerClassName)}>
        {/* Stacked Label — block above the input, no clipping, no overlap. */}
        {useStackedLabel && (
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <label
              htmlFor={props.id || props.name}
              className={cn(
                'block text-[12px] font-medium leading-snug transition-colors',
                stackedLabelState
              )}
            >
              {label}
              {required && (
                <span className="ml-0.5 text-destructive" aria-label="required">
                  *
                </span>
              )}
            </label>
            {trailingLabelAccessory && <div className="shrink-0">{trailingLabelAccessory}</div>}
          </div>
        )}
        <motion.div
          className={cn(inputGroupVariants({ state, size }))}
          animate={shouldShake ? 'shake' : undefined}
          variants={shakeAnimation}
        >
          {/* Left Icon */}
          {hasLeftIcon && (
            <div
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 z-10',
                'text-foreground/50',
                isFocused && 'text-primary',
                hasError && 'text-destructive',
                success && 'text-primary'
              )}
            >
              {leftIcon}
            </div>
          )}

          {/* Input Field */}
          <input
            ref={actualRef}
            className={cn(
              inputFieldVariants({
                size,
                hasIcon: hasLeftIcon || showStateIcon || showClearButton || Boolean(rightIcon),
                iconPosition: hasLeftIcon ? 'left' : 'right',
              }),
              hasLeftIcon && (showStateIcon || showClearButton || Boolean(rightIcon)) && 'pr-11',
              // In stacked mode the label is gone from the input box, so we
              // can use the full vertical room for the value (no top padding
              // reservation). Drop pt-6/pt-7 and re-center.
              useStackedLabel && size === 'sm' && 'h-11 pt-2',
              useStackedLabel && size === 'md' && 'h-12 pt-2',
              useStackedLabel && size === 'lg' && 'h-14 pt-2.5',
              className
            )}
            disabled={disabled}
            required={required}
            value={value}
            defaultValue={defaultValue}
            onFocus={handleFocus}
            onBlur={handleBlur}
            aria-invalid={Boolean(hasError)}
            aria-required={required}
            aria-describedby={hasError ? errorId : undefined}
            placeholder={
              // Floating-label mode relies on the placeholder being a single
              // whitespace so the label can float when empty. Stacked mode
              // shows the caller's placeholder directly.
              useStackedLabel ? (placeholderProp ?? '') : (placeholderProp ?? ' ')
            }
            {...props}
          />

          {/* Floating Label — only when truncateLabel is true (default). */}
          {label && !useStackedLabel && (
            <label
              htmlFor={props.id || props.name}
              title={typeof label === 'string' ? label : undefined}
              className={cn(
                floatingLabelVariants({ state, floated: isLabelFloated, size }),
                hasLeftIcon ? 'left-11 right-12' : 'left-4 right-12',
                'flex min-w-0 items-center gap-0.5'
              )}
            >
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {required && (
                <span className="flex-shrink-0 text-destructive" aria-label="required">
                  *
                </span>
              )}
            </label>
          )}

          {/* Right Side: State Icon or Clear Button */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5">
            {showClearButton && (
              <button
                type="button"
                onClick={handleClear}
                className="p-0.5 rounded-full text-foreground/40 hover:text-foreground/60 transition-colors"
                aria-label="Clear input"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {showStateIcon &&
              (hasError ? (
                <CircleX className="w-5 h-5 text-destructive" aria-hidden="true" />
              ) : success ? (
                <CircleCheck className="w-5 h-5 text-primary" aria-hidden="true" />
              ) : null)}
            {rightIcon && !showStateIcon && !showClearButton && (
              <div className="text-foreground/40 inline-flex items-center justify-center">
                {rightIcon}
              </div>
            )}
          </div>
        </motion.div>

        {/* Description */}
        {description && <p className="mt-1.5 text-xs text-foreground/50">{description}</p>}

        <InputFeedback
          error={error}
          errorId={errorId}
          hasError={hasError}
          helpText={helpText}
          helpTextPlacement={helpTextPlacement}
        />
      </div>
    )
  }
)
AuroraInput.displayName = 'AuroraInput'

// ─────────────────────────────────────────
// PASSWORD INPUT
// ─────────────────────────────────────────

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ showStrength, className, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false)

    return (
      <AuroraInput
        ref={ref}
        type={showPassword ? 'text' : 'password'}
        className={className}
        rightIcon={
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="p-1 -mr-1 rounded-md text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5 transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        }
        {...props}
      />
    )
  }
)
PasswordInput.displayName = 'PasswordInput'

// ─────────────────────────────────────────
// SEARCH INPUT
// ─────────────────────────────────────────

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ onSearch, onKeyDown, ...props }, ref) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && onSearch) {
        onSearch(e.currentTarget.value)
      }
      onKeyDown?.(e)
    }

    return (
      <AuroraInput
        ref={ref}
        type="search"
        leftIcon={<Search className="w-5 h-5" />}
        clearable
        onKeyDown={handleKeyDown}
        {...props}
      />
    )
  }
)
SearchInput.displayName = 'SearchInput'

// ─────────────────────────────────────────
// TEXTAREA
// ─────────────────────────────────────────

const AuroraTextarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      containerClassName,
      label,
      error,
      touched,
      success,
      size = 'md',
      disabled,
      required,
      value,
      defaultValue,
      autoResize,
      onFocus,
      onBlur,
      onChange,
      helpText,
      helpTextPlacement = 'below',
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = React.useState(false)
    const [hasValue, setHasValue] = React.useState(false)
    const textareaRef = React.useRef<HTMLTextAreaElement>(null)

    React.useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement)

    // Sync hasValue with actual textarea value on mount and when value/defaultValue changes
    React.useEffect(() => {
      setHasValue(
        deriveHasFieldValue({
          value,
          defaultValue,
          elementValue: textareaRef.current?.value,
        })
      )
    }, [value, defaultValue])

    const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      setIsFocused(true)
      onFocus?.(e)
    }

    const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      setIsFocused(false)
      setHasValue(Boolean(e.target.value))
      onBlur?.(e)
    }

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (autoResize && textareaRef.current) {
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
      }
      setHasValue(Boolean(e.target.value))
      onChange?.(e)
    }

    const hasError = hasVisibleFieldError(error, touched)
    const state = deriveFieldVisualState({ disabled, hasError, isFocused, success })
    const shouldShake = useFieldErrorShake(hasError)
    const fieldId = props.id || props.name
    const errorId = getFieldErrorId(fieldId)

    const isFloated = isFocused || hasValue

    const sizeClasses = {
      sm: 'min-h-[100px] px-4 pt-6 pb-2 text-sm',
      md: 'min-h-[120px] px-4 pt-7 pb-2 text-base',
      lg: 'min-h-[140px] px-4 pt-8 pb-2 text-lg',
    }

    return (
      <div className={cn(inputContainerVariants({ size }), containerClassName)}>
        <motion.div
          className={cn(inputGroupVariants({ state, size }))}
          animate={shouldShake ? 'shake' : undefined}
          variants={shakeAnimation}
        >
          <textarea
            ref={textareaRef}
            className={cn(
              'w-full border-none rounded-xl bg-transparent',
              'focus:outline-none focus:ring-0',
              'transition-all duration-200 ease-in-out',
              'placeholder:text-transparent text-foreground',
              'disabled:cursor-not-allowed resize-none',
              sizeClasses[size || 'md'],
              className
            )}
            disabled={disabled}
            required={required}
            value={value}
            defaultValue={defaultValue}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChange={handleChange}
            aria-invalid={Boolean(hasError)}
            aria-required={required}
            aria-describedby={hasError ? errorId : undefined}
            placeholder=" "
            {...props}
          />

          {/* Floating Label */}
          {label && (
            <label
              htmlFor={props.id || props.name}
              className={cn(floatingLabelVariants({ state, floated: isFloated, size }))}
            >
              {label}
              {required && (
                <span className="text-destructive ml-0.5" aria-label="required">
                  *
                </span>
              )}
            </label>
          )}

          {/* State Icon */}
          {(hasError || success) && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
              {hasError ? (
                <CircleX className="w-5 h-5 text-destructive" aria-hidden="true" />
              ) : success ? (
                <CircleCheck className="w-5 h-5 text-primary" aria-hidden="true" />
              ) : null}
            </div>
          )}
        </motion.div>

        <InputFeedback
          error={error}
          errorId={errorId}
          hasError={hasError}
          helpText={helpText}
          helpTextPlacement={helpTextPlacement}
        />
      </div>
    )
  }
)
AuroraTextarea.displayName = 'AuroraTextarea'

export { AuroraInput, PasswordInput, SearchInput, AuroraTextarea }
