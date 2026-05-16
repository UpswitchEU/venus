'use client'

/**
 * Hybrid Aurora Design System
 * Slider Component
 *
 * Range slider with spring animations and track fill visualization.
 */

import { cva, type VariantProps } from 'class-variance-authority'
import { motion } from 'framer-motion'
import * as React from 'react'
import { cn } from '../utils'
import { springSnappy } from './motion'

// ─────────────────────────────────────────
// STYLE VARIANTS
// ─────────────────────────────────────────

const sliderTrackVariants = cva(
  ['relative w-full rounded-full', 'bg-foreground/[0.10]', 'cursor-pointer'],
  {
    variants: {
      size: {
        sm: 'h-1.5',
        md: 'h-2',
        lg: 'h-2.5',
      },
      disabled: {
        true: 'opacity-50 cursor-not-allowed',
        false: '',
      },
    },
    defaultVariants: {
      size: 'md',
      disabled: false,
    },
  }
)

const sliderThumbVariants = cva(
  [
    'absolute top-1/2 -translate-y-1/2 z-10',
    'rounded-full bg-background',
    'border-2 border-primary',
    'shadow-md cursor-grab active:cursor-grabbing',
    'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background',
    'transition-shadow',
  ],
  {
    variants: {
      size: {
        sm: 'w-4 h-4',
        md: 'w-5 h-5',
        lg: 'w-6 h-6',
      },
      variant: {
        default: 'border-primary',
        success: 'border-success',
        accent: 'border-accent',
      },
      disabled: {
        true: 'cursor-not-allowed',
        false: '',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'default',
      disabled: false,
    },
  }
)

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface SliderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Current value */
  value?: number
  /** Default value for uncontrolled usage */
  defaultValue?: number
  /** Minimum value */
  min?: number
  /** Maximum value */
  max?: number
  /** Step increment */
  step?: number
  /** Callback when value changes */
  onChange?: (value: number) => void
  /** Callback when sliding ends */
  onChangeEnd?: (value: number) => void
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Color variant */
  variant?: 'default' | 'success' | 'accent'
  /** Disabled state */
  disabled?: boolean
  /** Show value tooltip while dragging */
  showTooltip?: boolean
  /** Custom value formatter for tooltip */
  formatValue?: (value: number) => string
  /** Show min/max labels */
  showLabels?: boolean
  /** Label for the slider */
  label?: string
}

export interface RangeSliderProps
  extends Omit<SliderProps, 'value' | 'defaultValue' | 'onChange' | 'onChangeEnd'> {
  /** Current range values [min, max] */
  value?: [number, number]
  /** Default range values for uncontrolled usage */
  defaultValue?: [number, number]
  /** Callback when range changes */
  onChange?: (value: [number, number]) => void
  /** Callback when sliding ends */
  onChangeEnd?: (value: [number, number]) => void
  /** Minimum distance between thumbs */
  minDistance?: number
}

// ─────────────────────────────────────────
// SLIDER COMPONENT
// ─────────────────────────────────────────

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  (
    {
      className,
      value: controlledValue,
      defaultValue = 0,
      min = 0,
      max = 100,
      step = 1,
      onChange,
      onChangeEnd,
      size = 'md',
      variant = 'default',
      disabled = false,
      showTooltip = false,
      formatValue = (v) => String(v),
      showLabels = false,
      label,
      ...props
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState(defaultValue)
    const [isDragging, setIsDragging] = React.useState(false)
    const trackRef = React.useRef<HTMLDivElement>(null)

    const isControlled = controlledValue !== undefined
    const value = isControlled ? controlledValue : internalValue

    const clampedValue = Math.min(max, Math.max(min, value))
    const percentage = ((clampedValue - min) / (max - min)) * 100

    const updateValue = (clientX: number) => {
      if (disabled || !trackRef.current) return

      const rect = trackRef.current.getBoundingClientRect()
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const rawValue = min + percent * (max - min)
      const steppedValue = Math.round(rawValue / step) * step
      const newValue = Math.min(max, Math.max(min, steppedValue))

      if (!isControlled) {
        setInternalValue(newValue)
      }
      onChange?.(newValue)
    }

    const handleMouseDown = (e: React.MouseEvent) => {
      if (disabled) return
      e.preventDefault()
      setIsDragging(true)
      updateValue(e.clientX)
    }

    const handleTouchStart = (e: React.TouchEvent) => {
      if (disabled) return
      setIsDragging(true)
      updateValue(e.touches[0].clientX)
    }

    React.useEffect(() => {
      if (!isDragging) return

      const handleMouseMove = (e: MouseEvent) => updateValue(e.clientX)
      const handleTouchMove = (e: TouchEvent) => updateValue(e.touches[0].clientX)

      const handleEnd = () => {
        setIsDragging(false)
        onChangeEnd?.(isControlled ? controlledValue : internalValue)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleEnd)
      window.addEventListener('touchmove', handleTouchMove)
      window.addEventListener('touchend', handleEnd)

      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleEnd)
        window.removeEventListener('touchmove', handleTouchMove)
        window.removeEventListener('touchend', handleEnd)
      }
    }, [isDragging, isControlled, controlledValue, internalValue, onChangeEnd, updateValue])

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (disabled) return

      let newValue = clampedValue
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          newValue = Math.min(max, clampedValue + step)
          break
        case 'ArrowLeft':
        case 'ArrowDown':
          newValue = Math.max(min, clampedValue - step)
          break
        case 'Home':
          newValue = min
          break
        case 'End':
          newValue = max
          break
        default:
          return
      }

      e.preventDefault()
      if (!isControlled) {
        setInternalValue(newValue)
      }
      onChange?.(newValue)
      onChangeEnd?.(newValue)
    }

    const fillColor = {
      default: 'bg-primary',
      success: 'bg-success',
      accent: 'bg-accent',
    }

    // ARIA labelling props belong on the role="slider" element — NOT on the
    // outer wrapper — so screen readers announce the milestone instead of an
    // anonymous "slider, 50". We pull them out of `...props` to avoid double
    // application (and the resulting duplicate aria warning in jsdom).
    const {
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      'aria-describedby': ariaDescribedBy,
      ...wrapperProps
    } = props as React.HTMLAttributes<HTMLDivElement>

    return (
      <div ref={ref} className={cn('w-full', className)} {...wrapperProps}>
        {label && (
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-foreground">{label}</label>
            <span className="text-sm text-foreground/60 font-mono">
              {formatValue(clampedValue)}
            </span>
          </div>
        )}

        <div
          ref={trackRef}
          className={cn(
            'relative flex items-center cursor-pointer',
            size === 'sm' ? 'h-5' : size === 'lg' ? 'h-7' : 'h-6',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          role="slider"
          aria-label={ariaLabel ?? label}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={clampedValue}
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={handleKeyDown}
        >
          <div
            className={cn(
              sliderTrackVariants({ size, disabled }),
              'absolute inset-x-0 top-1/2 -translate-y-1/2'
            )}
          >
            <motion.div
              className={cn('absolute left-0 top-0 h-full rounded-full', fillColor[variant])}
              initial={false}
              animate={{ width: `${percentage}%` }}
              transition={springSnappy}
            />
          </div>

          <motion.div
            className={cn(
              'absolute top-1/2 z-10',
              'rounded-full bg-background',
              'shadow-md cursor-grab active:cursor-grabbing',
              'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background',
              'transition-shadow',
              size === 'sm'
                ? 'w-4 h-4 border-2'
                : size === 'lg'
                  ? 'w-6 h-6 border-[3px]'
                  : 'w-5 h-5 border-2',
              variant === 'success'
                ? 'border-success'
                : variant === 'accent'
                  ? 'border-accent'
                  : 'border-primary',
              disabled && 'cursor-not-allowed'
            )}
            initial={false}
            animate={{
              left: `${percentage}%`,
              x: '-50%',
              y: '-50%',
            }}
            transition={springSnappy}
            whileHover={!disabled ? { scale: 1.1 } : undefined}
            whileTap={!disabled ? { scale: 0.95 } : undefined}
          >
            {showTooltip && isDragging && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className={cn(
                  'absolute -top-8 left-1/2 -translate-x-1/2',
                  'px-2 py-1 rounded-md',
                  'bg-foreground text-background',
                  'text-xs font-medium whitespace-nowrap'
                )}
              >
                {formatValue(clampedValue)}
              </motion.div>
            )}
          </motion.div>
        </div>

        {showLabels && (
          <div className="flex justify-between mt-1">
            <span className="text-xs text-foreground/50">{formatValue(min)}</span>
            <span className="text-xs text-foreground/50">{formatValue(max)}</span>
          </div>
        )}
      </div>
    )
  }
)
Slider.displayName = 'Slider'

// ─────────────────────────────────────────
// RANGE SLIDER COMPONENT
// ─────────────────────────────────────────

const RangeSlider = React.forwardRef<HTMLDivElement, RangeSliderProps>(
  (
    {
      className,
      value: controlledValue,
      defaultValue = [25, 75],
      min = 0,
      max = 100,
      step = 1,
      onChange,
      onChangeEnd,
      size = 'md',
      variant = 'default',
      disabled = false,
      showTooltip = false,
      formatValue = (v) => String(v),
      showLabels = false,
      label,
      minDistance = 0,
      ...props
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState(defaultValue)
    const [activeThumb, setActiveThumb] = React.useState<0 | 1 | null>(null)
    const trackRef = React.useRef<HTMLDivElement>(null)

    const isControlled = controlledValue !== undefined
    const value = isControlled ? controlledValue : internalValue

    const [minVal, maxVal] = value
    const minPercent = ((minVal - min) / (max - min)) * 100
    const maxPercent = ((maxVal - min) / (max - min)) * 100

    const updateValue = (clientX: number, thumbIndex: 0 | 1) => {
      if (disabled || !trackRef.current) return

      const rect = trackRef.current.getBoundingClientRect()
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const rawValue = min + percent * (max - min)
      const steppedValue = Math.round(rawValue / step) * step

      let newValue: [number, number] = [...value] as [number, number]

      if (thumbIndex === 0) {
        newValue[0] = Math.min(steppedValue, value[1] - minDistance)
        newValue[0] = Math.max(min, newValue[0])
      } else {
        newValue[1] = Math.max(steppedValue, value[0] + minDistance)
        newValue[1] = Math.min(max, newValue[1])
      }

      if (!isControlled) {
        setInternalValue(newValue)
      }
      onChange?.(newValue)
    }

    const handleThumbMouseDown = (e: React.MouseEvent, thumbIndex: 0 | 1) => {
      if (disabled) return
      e.preventDefault()
      e.stopPropagation()
      setActiveThumb(thumbIndex)
    }

    React.useEffect(() => {
      if (activeThumb === null) return

      const handleMouseMove = (e: MouseEvent) => updateValue(e.clientX, activeThumb)

      const handleEnd = () => {
        setActiveThumb(null)
        onChangeEnd?.(isControlled ? controlledValue : internalValue)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleEnd)

      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleEnd)
      }
    }, [activeThumb, isControlled, controlledValue, internalValue, onChangeEnd, updateValue])

    const fillColor = {
      default: 'bg-primary',
      success: 'bg-success',
      accent: 'bg-accent',
    }

    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        {label && (
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-foreground">{label}</label>
            <span className="text-sm text-foreground/60 font-mono">
              {formatValue(minVal)} – {formatValue(maxVal)}
            </span>
          </div>
        )}

        <div
          ref={trackRef}
          className={cn(
            'relative flex items-center cursor-pointer',
            size === 'sm' ? 'h-5' : size === 'lg' ? 'h-7' : 'h-6',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <div
            className={cn(
              sliderTrackVariants({ size, disabled }),
              'absolute inset-x-0 top-1/2 -translate-y-1/2'
            )}
          >
            <motion.div
              className={cn('absolute top-0 h-full rounded-full', fillColor[variant])}
              initial={false}
              animate={{
                left: `${minPercent}%`,
                width: `${maxPercent - minPercent}%`,
              }}
              transition={springSnappy}
            />
          </div>

          {/* Min Thumb */}
          <motion.div
            className={cn(
              'absolute top-1/2 z-10',
              'rounded-full bg-background',
              'shadow-md cursor-grab active:cursor-grabbing',
              size === 'sm'
                ? 'w-4 h-4 border-2'
                : size === 'lg'
                  ? 'w-6 h-6 border-[3px]'
                  : 'w-5 h-5 border-2',
              variant === 'success'
                ? 'border-success'
                : variant === 'accent'
                  ? 'border-accent'
                  : 'border-primary',
              disabled && 'cursor-not-allowed'
            )}
            initial={false}
            animate={{
              left: `${minPercent}%`,
              x: '-50%',
              y: '-50%',
            }}
            transition={springSnappy}
            whileHover={!disabled ? { scale: 1.1 } : undefined}
            whileTap={!disabled ? { scale: 0.95 } : undefined}
            onMouseDown={(e) => handleThumbMouseDown(e, 0)}
          >
            {showTooltip && activeThumb === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'absolute -top-8 left-1/2 -translate-x-1/2',
                  'px-2 py-1 rounded-md',
                  'bg-foreground text-background',
                  'text-xs font-medium whitespace-nowrap'
                )}
              >
                {formatValue(minVal)}
              </motion.div>
            )}
          </motion.div>

          {/* Max Thumb */}
          <motion.div
            className={cn(
              'absolute top-1/2 z-10',
              'rounded-full bg-background',
              'shadow-md cursor-grab active:cursor-grabbing',
              size === 'sm'
                ? 'w-4 h-4 border-2'
                : size === 'lg'
                  ? 'w-6 h-6 border-[3px]'
                  : 'w-5 h-5 border-2',
              variant === 'success'
                ? 'border-success'
                : variant === 'accent'
                  ? 'border-accent'
                  : 'border-primary',
              disabled && 'cursor-not-allowed'
            )}
            initial={false}
            animate={{
              left: `${maxPercent}%`,
              x: '-50%',
              y: '-50%',
            }}
            transition={springSnappy}
            whileHover={!disabled ? { scale: 1.1 } : undefined}
            whileTap={!disabled ? { scale: 0.95 } : undefined}
            onMouseDown={(e) => handleThumbMouseDown(e, 1)}
          >
            {showTooltip && activeThumb === 1 && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'absolute -top-8 left-1/2 -translate-x-1/2',
                  'px-2 py-1 rounded-md',
                  'bg-foreground text-background',
                  'text-xs font-medium whitespace-nowrap'
                )}
              >
                {formatValue(maxVal)}
              </motion.div>
            )}
          </motion.div>
        </div>

        {showLabels && (
          <div className="flex justify-between mt-1">
            <span className="text-xs text-foreground/50">{formatValue(min)}</span>
            <span className="text-xs text-foreground/50">{formatValue(max)}</span>
          </div>
        )}
      </div>
    )
  }
)
RangeSlider.displayName = 'RangeSlider'

// ─────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────

export { Slider, RangeSlider, sliderTrackVariants, sliderThumbVariants }
