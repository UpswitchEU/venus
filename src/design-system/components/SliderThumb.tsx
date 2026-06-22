import { motion } from 'framer-motion'
import * as React from 'react'
import { cn } from '../utils'
import { springSnappy } from './motion'
import {
  type SliderSize,
  type SliderVariant,
  sliderThumbBorderClass,
  sliderThumbVisualSize,
} from './Slider.styles'

interface SliderThumbProps {
  percentage: number
  value: number
  size: SliderSize
  variant: SliderVariant
  disabled: boolean
  showTooltip: boolean
  formatValue: (value: number) => string
  onMouseDown?: (event: React.MouseEvent) => void
  onTouchStart?: (event: React.TouchEvent) => void
}

export function SliderThumb({
  percentage,
  value,
  size,
  variant,
  disabled,
  showTooltip,
  formatValue,
  onMouseDown,
  onTouchStart,
}: SliderThumbProps) {
  return (
    <motion.div
      className={cn(
        'absolute top-1/2 z-10 flex h-11 w-11 items-center justify-center',
        'cursor-grab active:cursor-grabbing touch-manipulation',
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
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      <span
        className={cn(
          'block rounded-full border-2 bg-background shadow-md pointer-events-none',
          sliderThumbVisualSize(size),
          sliderThumbBorderClass(variant)
        )}
        aria-hidden="true"
      />
      {showTooltip && (
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
          {formatValue(value)}
        </motion.div>
      )}
    </motion.div>
  )
}
