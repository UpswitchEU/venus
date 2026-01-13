/**
 * Smart Adjustment Amount Input Component
 *
 * Features:
 * - Clears placeholder "0" on focus
 * - Allows minus "-" as first character
 * - Visual indicators (green for positive, red for negative)
 * - Category-specific placeholders
 * - Real-time formatting
 */

import React, { useEffect, useRef, useState } from 'react'
import { NormalizationCategoryDefinition } from '../../types/ebitdaNormalization'

interface AdjustmentAmountInputProps {
  category: NormalizationCategoryDefinition
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}

export function AdjustmentAmountInput({
  category,
  value,
  onChange,
  disabled = false,
}: AdjustmentAmountInputProps) {
  const [inputValue, setInputValue] = useState<string>('')
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync value to input display
  useEffect(() => {
    if (!isFocused) {
      setInputValue(value === 0 ? '' : String(value))
    }
  }, [value, isFocused])

  const handleFocus = () => {
    setIsFocused(true)
    // Clear if it's zero
    if (value === 0) {
      setInputValue('')
    }
  }

  const handleBlur = () => {
    setIsFocused(false)
    // Parse and normalize the value
    const parsed = parseFloat(inputValue)
    if (isNaN(parsed) || inputValue === '' || inputValue === '-') {
      onChange(0)
      setInputValue('')
    } else {
      onChange(parsed)
      setInputValue(String(parsed))
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value

    // Allow empty, minus sign, numbers, and one decimal point
    if (newValue === '' || newValue === '-' || /^-?\d*\.?\d*$/.test(newValue)) {
      setInputValue(newValue)

      // Update parent if it's a valid number
      const parsed = parseFloat(newValue)
      if (!isNaN(parsed)) {
        onChange(parsed)
      } else if (newValue === '' || newValue === '-') {
        // Don't update parent while typing minus or empty
      }
    }
  }

  const getPlaceholder = () => {
    if (category.adjustmentDirection === 'add') {
      return 'e.g., 10000 (add back)'
    } else if (category.adjustmentDirection === 'subtract') {
      return 'e.g., -10000 (subtract)'
    } else {
      return 'e.g., 10000 or -10000'
    }
  }

  const getVisualIndicator = () => {
    if (value === 0) return null

    return (
      <div
        className={`absolute right-16 top-1/2 -translate-y-1/2 text-sm font-semibold transition-colors ${
          value > 0 ? 'text-moss-600' : 'text-rust-600'
        }`}
      >
        {value > 0 ? '+' : '−'}
      </div>
    )
  }

  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 text-sm font-medium z-10">
        €
      </span>

      {getVisualIndicator()}

      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={inputValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        className={`
          w-full h-14 px-4 pt-6 pb-2 pl-8 text-base text-slate-ink bg-white 
          border rounded-xl transition-all duration-200
          ${
            value > 0
              ? 'border-moss-300 hover:border-moss-400 focus:border-moss-500 focus:ring-2 focus:ring-moss-500/20'
              : value < 0
                ? 'border-rust-300 hover:border-rust-400 focus:border-rust-500 focus:ring-2 focus:ring-rust-500/20'
                : 'border-gray-200 hover:border-primary-300 focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20'
          }
          focus:outline-none
          placeholder:text-stone-300
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
        placeholder={getPlaceholder()}
        aria-label={`${category.label} amount`}
      />

      <label className="absolute left-8 top-2 text-xs text-stone-500 font-medium pointer-events-none">
        Adjustment Amount
      </label>
    </div>
  )
}
