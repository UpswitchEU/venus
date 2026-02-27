'use client'

/**
 * Hybrid Aurora Design System
 * Checkbox & Radio Components
 *
 * Accessible form controls with spring animations and Hybrid Aurora styling.
 */

import { cva, type VariantProps } from 'class-variance-authority'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Minus } from 'lucide-react'
import * as React from 'react'
import { cn } from '../utils'
import { springSnappy } from './motion'

// ─────────────────────────────────────────
// ANIMATION VARIANTS
// ─────────────────────────────────────────

const checkVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: springSnappy,
  },
  exit: {
    scale: 0,
    opacity: 0,
    transition: { duration: 0.1 },
  },
}

// ─────────────────────────────────────────
// CHECKBOX STYLES
// ─────────────────────────────────────────

const checkboxVariants = cva(
  [
    'peer shrink-0 rounded-md border-2 transition-all duration-200',
    'flex items-center justify-center',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:cursor-not-allowed disabled:opacity-50',
  ],
  {
    variants: {
      size: {
        sm: 'w-4 h-4',
        md: 'w-5 h-5',
        lg: 'w-6 h-6',
      },
      variant: {
        default: [
          'border-foreground/20 bg-foreground/[0.04]',
          'hover:border-foreground/30 hover:bg-foreground/[0.06]',
          'data-[state=checked]:bg-primary data-[state=checked]:border-primary',
          'data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary',
        ].join(' '),
        success: [
          'border-foreground/20 bg-foreground/[0.04]',
          'hover:border-success/50',
          'data-[state=checked]:bg-success data-[state=checked]:border-success',
        ].join(' '),
        error: [
          'border-destructive/50 bg-destructive/[0.04]',
          'hover:border-destructive',
          'data-[state=checked]:bg-destructive data-[state=checked]:border-destructive',
        ].join(' '),
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'default',
    },
  }
)

const iconSizes = {
  sm: 'w-2.5 h-2.5',
  md: 'w-3 h-3',
  lg: 'w-4 h-4',
}

// ─────────────────────────────────────────
// CHECKBOX COMPONENT
// ─────────────────────────────────────────

export interface CheckboxProps extends VariantProps<typeof checkboxVariants> {
  checked?: boolean
  defaultChecked?: boolean
  indeterminate?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  label?: React.ReactNode
  description?: string
  error?: string
  className?: string
  id?: string
  name?: string
  required?: boolean
}

export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  (
    {
      checked: controlledChecked,
      defaultChecked = false,
      indeterminate = false,
      onChange,
      disabled = false,
      label,
      description,
      error,
      size = 'md',
      variant = 'default',
      className,
      id,
      name,
      required = false,
    },
    ref
  ) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked)
    const checked = controlledChecked !== undefined ? controlledChecked : internalChecked

    const generatedId = React.useId()
    const checkboxId = id || generatedId

    const handleClick = () => {
      if (disabled) return
      const newValue = !checked
      if (controlledChecked === undefined) {
        setInternalChecked(newValue)
      }
      onChange?.(newValue)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        handleClick()
      }
    }

    const state = indeterminate ? 'indeterminate' : checked ? 'checked' : 'unchecked'

    const hasDescription = !!description || !!error

    return (
      <div className={cn('flex gap-3', hasDescription ? 'items-start' : 'items-center', className)}>
        <button
          ref={ref}
          type="button"
          role="checkbox"
          id={checkboxId}
          name={name}
          aria-checked={indeterminate ? 'mixed' : checked}
          aria-required={required}
          aria-invalid={!!error}
          data-state={state}
          disabled={disabled}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className={cn(
            checkboxVariants({ size, variant: error ? 'error' : variant }),
            hasDescription && 'mt-0.5'
          )}
        >
          <AnimatePresence mode="wait">
            {(checked || indeterminate) && (
              <motion.span
                key={indeterminate ? 'indeterminate' : 'checked'}
                variants={checkVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="text-primary-foreground"
              >
                {indeterminate ? (
                  <Minus className={iconSizes[size || 'md']} strokeWidth={3} />
                ) : (
                  <Check className={iconSizes[size || 'md']} strokeWidth={3} />
                )}
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {(label || description || error) && (
          <div className="flex flex-col gap-0.5">
            {label && (
              <label
                htmlFor={checkboxId}
                className={cn(
                  'text-sm font-medium cursor-pointer select-none leading-none',
                  disabled ? 'text-foreground/50 cursor-not-allowed' : 'text-foreground',
                  error && 'text-destructive'
                )}
              >
                {label}
                {required && <span className="text-destructive ml-1">*</span>}
              </label>
            )}
            {description && <span className="text-xs text-foreground/60">{description}</span>}
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        )}
      </div>
    )
  }
)
Checkbox.displayName = 'Checkbox'

// ─────────────────────────────────────────
// CHECKBOX GROUP
// ─────────────────────────────────────────

export interface CheckboxGroupProps {
  label?: string
  description?: string
  error?: string
  children: React.ReactNode
  className?: string
  required?: boolean
  orientation?: 'horizontal' | 'vertical'
}

export const CheckboxGroup = React.forwardRef<HTMLFieldSetElement, CheckboxGroupProps>(
  (
    { label, description, error, children, className, required = false, orientation = 'vertical' },
    ref
  ) => {
    return (
      <fieldset ref={ref} className={cn('space-y-3', className)}>
        {label && (
          <legend
            className={cn('text-sm font-medium text-foreground', error && 'text-destructive')}
          >
            {label}
            {required && <span className="text-destructive ml-1">*</span>}
          </legend>
        )}
        {description && <p className="text-xs text-foreground/60">{description}</p>}
        <div
          className={cn(
            'flex gap-4',
            orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap'
          )}
        >
          {children}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </fieldset>
    )
  }
)
CheckboxGroup.displayName = 'CheckboxGroup'

// ─────────────────────────────────────────
// RADIO STYLES
// ─────────────────────────────────────────

const radioVariants = cva(
  [
    'peer shrink-0 rounded-full border-2 transition-all duration-200',
    'flex items-center justify-center',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:cursor-not-allowed disabled:opacity-50',
  ],
  {
    variants: {
      size: {
        sm: 'w-4 h-4',
        md: 'w-5 h-5',
        lg: 'w-6 h-6',
      },
      variant: {
        default: [
          'border-foreground/20 bg-foreground/[0.04]',
          'hover:border-foreground/30 hover:bg-foreground/[0.06]',
          'data-[state=checked]:border-primary',
        ].join(' '),
        success: [
          'border-foreground/20 bg-foreground/[0.04]',
          'hover:border-success/50',
          'data-[state=checked]:border-success',
        ].join(' '),
        error: [
          'border-destructive/50 bg-destructive/[0.04]',
          'hover:border-destructive',
          'data-[state=checked]:border-destructive',
        ].join(' '),
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'default',
    },
  }
)

const dotSizes = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-2.5 h-2.5',
}

// ─────────────────────────────────────────
// RADIO COMPONENT
// ─────────────────────────────────────────

export interface RadioProps extends VariantProps<typeof radioVariants> {
  checked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  label?: React.ReactNode
  description?: string
  className?: string
  id?: string
  name?: string
  value?: string
}

export const Radio = React.forwardRef<HTMLButtonElement, RadioProps>(
  (
    {
      checked = false,
      onChange,
      disabled = false,
      label,
      description,
      size = 'md',
      variant = 'default',
      className,
      id,
      name,
      value,
    },
    ref
  ) => {
    const generatedId = React.useId()
    const radioId = id || generatedId

    const handleClick = () => {
      if (disabled || checked) return
      onChange?.(true)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        handleClick()
      }
    }

    const hasDescription = !!description

    return (
      <div className={cn('flex gap-3', hasDescription ? 'items-start' : 'items-center', className)}>
        <button
          ref={ref}
          type="button"
          role="radio"
          id={radioId}
          name={name}
          aria-checked={checked}
          data-state={checked ? 'checked' : 'unchecked'}
          data-value={value}
          disabled={disabled}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className={cn(radioVariants({ size, variant }), hasDescription && 'mt-0.5')}
        >
          <AnimatePresence>
            {checked && (
              <motion.span
                variants={checkVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className={cn(
                  'rounded-full',
                  dotSizes[size || 'md'],
                  variant === 'success'
                    ? 'bg-success'
                    : variant === 'error'
                      ? 'bg-destructive'
                      : 'bg-primary'
                )}
              />
            )}
          </AnimatePresence>
        </button>

        {(label || description) && (
          <div className="flex flex-col gap-0.5">
            {label && (
              <label
                htmlFor={radioId}
                className={cn(
                  'text-sm font-medium cursor-pointer select-none leading-none',
                  disabled ? 'text-foreground/50 cursor-not-allowed' : 'text-foreground'
                )}
              >
                {label}
              </label>
            )}
            {description && <span className="text-xs text-foreground/60">{description}</span>}
          </div>
        )}
      </div>
    )
  }
)
Radio.displayName = 'Radio'

// ─────────────────────────────────────────
// RADIO GROUP
// ─────────────────────────────────────────

export interface RadioGroupProps extends VariantProps<typeof radioVariants> {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  label?: string
  description?: string
  error?: string
  children?: React.ReactNode
  options?: Array<{
    value: string
    label: React.ReactNode
    description?: string
    disabled?: boolean
  }>
  className?: string
  required?: boolean
  orientation?: 'horizontal' | 'vertical'
  name?: string
}

export const RadioGroup = React.forwardRef<HTMLFieldSetElement, RadioGroupProps>(
  (
    {
      value: controlledValue,
      defaultValue,
      onChange,
      label,
      description,
      error,
      children,
      options,
      size = 'md',
      variant = 'default',
      className,
      required = false,
      orientation = 'vertical',
      name,
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState(defaultValue || '')
    const value = controlledValue !== undefined ? controlledValue : internalValue
    const generatedName = React.useId()
    const groupName = name || generatedName

    const handleChange = (optionValue: string) => {
      if (controlledValue === undefined) {
        setInternalValue(optionValue)
      }
      onChange?.(optionValue)
    }

    return (
      <fieldset
        ref={ref}
        className={cn('space-y-3', className)}
        role="radiogroup"
        aria-required={required}
        aria-invalid={!!error}
      >
        {label && (
          <legend
            className={cn('text-sm font-medium text-foreground', error && 'text-destructive')}
          >
            {label}
            {required && <span className="text-destructive ml-1">*</span>}
          </legend>
        )}
        {description && <p className="text-xs text-foreground/60">{description}</p>}
        <div
          className={cn(
            'flex gap-4',
            orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap'
          )}
        >
          {options
            ? options.map((option) => (
                <Radio
                  key={option.value}
                  name={groupName}
                  value={option.value}
                  checked={value === option.value}
                  onChange={() => handleChange(option.value)}
                  label={option.label}
                  description={option.description}
                  disabled={option.disabled}
                  size={size}
                  variant={error ? 'error' : variant}
                />
              ))
            : React.Children.map(children, (child) => {
                if (React.isValidElement<RadioProps>(child)) {
                  return React.cloneElement(child, {
                    name: groupName,
                    checked: value === child.props.value,
                    onChange: () => handleChange(child.props.value || ''),
                    size: child.props.size || size,
                    variant: error ? 'error' : child.props.variant || variant,
                  })
                }
                return child
              })}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </fieldset>
    )
  }
)
RadioGroup.displayName = 'RadioGroup'

// ─────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────

export { checkboxVariants, radioVariants }
