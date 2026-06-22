import { type VariantProps } from 'class-variance-authority'
import { motion } from 'framer-motion'
import { CircleCheck, CircleX } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/utils'
import {
  deriveFieldVisualState,
  deriveHasFieldValue,
  getFieldErrorId,
  hasVisibleFieldError,
  useFieldErrorShake,
} from './Input.fieldState'
import {
  floatingLabelVariants,
  inputContainerVariants,
  inputFieldVariants,
  inputGroupVariants,
  shakeAnimation,
} from './Input.styles'
import { InputFeedback } from './InputFeedback'

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

export const AuroraTextarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
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
