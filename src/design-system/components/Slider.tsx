'use client'

/**
 * Hybrid Aurora Design System
 * Slider Component
 *
 * Range slider with spring animations and track fill visualization.
 */

import { motion } from 'framer-motion'
import * as React from 'react'
import { cn } from '../utils'
import { springSnappy } from './motion'
import {
  clampSliderValue,
  getSliderPercentage,
  updateRangeSliderValue,
  valueFromSliderClientX,
} from './Slider.model'
import {
  type SliderSize,
  type SliderVariant,
  sliderFillClassByVariant,
  sliderThumbVariants,
  sliderTrackHitAreaSize,
  sliderTrackVariants,
} from './Slider.styles'
import { SliderThumb } from './SliderThumb'

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
  size?: SliderSize
  /** Color variant */
  variant?: SliderVariant
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
    const latestValueRef = React.useRef(value)

    const clampedValue = clampSliderValue(value, min, max)
    const percentage = getSliderPercentage(clampedValue, min, max)

    React.useEffect(() => {
      latestValueRef.current = value
    }, [value])

    const updateValue = React.useCallback(
      (clientX: number) => {
        if (disabled || !trackRef.current) return

        const rect = trackRef.current.getBoundingClientRect()
        const newValue = valueFromSliderClientX(
          clientX,
          { left: rect.left, width: rect.width },
          { min, max, step }
        )

        latestValueRef.current = newValue
        if (!isControlled) {
          setInternalValue(newValue)
        }
        onChange?.(newValue)
      },
      [disabled, isControlled, max, min, onChange, step]
    )

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
        onChangeEnd?.(latestValueRef.current)
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
    }, [isDragging, onChangeEnd, updateValue])

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
      latestValueRef.current = newValue
      if (!isControlled) {
        setInternalValue(newValue)
      }
      onChange?.(newValue)
      onChangeEnd?.(newValue)
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
            sliderTrackHitAreaSize(size),
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
              className={cn(
                'absolute left-0 top-0 h-full rounded-full',
                sliderFillClassByVariant[variant]
              )}
              initial={false}
              animate={{ width: `${percentage}%` }}
              transition={springSnappy}
            />
          </div>

          <SliderThumb
            percentage={percentage}
            value={clampedValue}
            size={size}
            variant={variant}
            disabled={disabled}
            showTooltip={showTooltip && isDragging}
            formatValue={formatValue}
          />
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
    const latestValueRef = React.useRef(value)

    const [minVal, maxVal] = value
    const minPercent = getSliderPercentage(minVal, min, max)
    const maxPercent = getSliderPercentage(maxVal, min, max)

    React.useEffect(() => {
      latestValueRef.current = value
    }, [value])

    const updateValue = React.useCallback(
      (clientX: number, thumbIndex: 0 | 1) => {
        if (disabled || !trackRef.current) return

        const rect = trackRef.current.getBoundingClientRect()
        const steppedValue = valueFromSliderClientX(
          clientX,
          { left: rect.left, width: rect.width },
          { min, max, step }
        )
        const newValue = updateRangeSliderValue({
          currentValue: value,
          nextThumbValue: steppedValue,
          thumbIndex,
          min,
          max,
          minDistance,
        })

        latestValueRef.current = newValue
        if (!isControlled) {
          setInternalValue(newValue)
        }
        onChange?.(newValue)
      },
      [disabled, isControlled, max, min, minDistance, onChange, step, value]
    )

    const handleThumbMouseDown = (e: React.MouseEvent, thumbIndex: 0 | 1) => {
      if (disabled) return
      e.preventDefault()
      e.stopPropagation()
      setActiveThumb(thumbIndex)
      updateValue(e.clientX, thumbIndex)
    }

    const handleThumbTouchStart = (e: React.TouchEvent, thumbIndex: 0 | 1) => {
      if (disabled) return
      e.preventDefault()
      e.stopPropagation()
      setActiveThumb(thumbIndex)
      const touch = e.touches[0]
      if (touch) updateValue(touch.clientX, thumbIndex)
    }

    React.useEffect(() => {
      if (activeThumb === null) return

      const handleMouseMove = (e: MouseEvent) => updateValue(e.clientX, activeThumb)
      const handleTouchMove = (e: TouchEvent) => {
        const touch = e.touches[0]
        if (touch) updateValue(touch.clientX, activeThumb)
      }

      const handleEnd = () => {
        setActiveThumb(null)
        onChangeEnd?.(latestValueRef.current)
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
    }, [activeThumb, onChangeEnd, updateValue])

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
            sliderTrackHitAreaSize(size),
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
              className={cn(
                'absolute top-0 h-full rounded-full',
                sliderFillClassByVariant[variant]
              )}
              initial={false}
              animate={{
                left: `${minPercent}%`,
                width: `${maxPercent - minPercent}%`,
              }}
              transition={springSnappy}
            />
          </div>

          <SliderThumb
            percentage={minPercent}
            value={minVal}
            size={size}
            variant={variant}
            disabled={disabled}
            showTooltip={showTooltip && activeThumb === 0}
            formatValue={formatValue}
            onMouseDown={(e) => handleThumbMouseDown(e, 0)}
            onTouchStart={(e) => handleThumbTouchStart(e, 0)}
          />

          <SliderThumb
            percentage={maxPercent}
            value={maxVal}
            size={size}
            variant={variant}
            disabled={disabled}
            showTooltip={showTooltip && activeThumb === 1}
            formatValue={formatValue}
            onMouseDown={(e) => handleThumbMouseDown(e, 1)}
            onTouchStart={(e) => handleThumbTouchStart(e, 1)}
          />
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

export { RangeSlider, Slider, sliderThumbVariants, sliderTrackVariants }
