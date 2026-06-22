/**
 * Aurora Design System
 * Select / Dropdown Component
 *
 * Searchable dropdown with grouped options, following Hybrid Aurora patterns.
 * Uses floating labels, spring animations, and glass-morphism styling.
 *
 * Compatible with existing Venus CustomDropdown props.
 */

import { type VariantProps } from 'class-variance-authority'
import { motion } from 'framer-motion'
import { AlertCircle, ChevronDown, Search, X } from 'lucide-react'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { scrollElementIntoContainer } from '@/utils/scrollContainer'
import { cn } from '../../lib/utils'
import {
  createSelectFocusIndexMap,
  filterSelectOptions,
  flattenEnabledSelectOptions,
  flattenSelectOptions,
  isGroupedOptions,
} from './Select.model'
import {
  dropdownVariants,
  selectDropdownClassName,
  selectLabelVariants,
  selectSearchInputClassName,
  selectTriggerVariants,
} from './Select.styles'
import type { SelectOptions } from './Select.types'
import { SelectOptionItem } from './SelectOptionItem'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────
export type { SelectGroup, SelectOption, SelectOptions } from './Select.types'

// ─────────────────────────────────────────
// SELECT COMPONENT
// ─────────────────────────────────────────

export interface AuroraSelectProps extends VariantProps<typeof selectTriggerVariants> {
  options: SelectOptions
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  placeholder?: string
  label?: string
  error?: string
  touched?: boolean
  disabled?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  className?: string
  required?: boolean
  clearable?: boolean
  helpText?: string
  helpTextPlacement?: 'tooltip' | 'below'
  name?: string
  dropdownRef?: React.RefObject<HTMLDivElement>
  /** Called when user clicks or hovers a disabled option (e.g. Painted Door demand tracking) */
  onDisabledOptionInteract?: (value: string, action: 'click' | 'hover') => void
}

export const AuroraSelect = React.forwardRef<HTMLDivElement, AuroraSelectProps>(
  (
    {
      options,
      value: controlledValue,
      defaultValue,
      onChange,
      placeholder = 'Select an option',
      label,
      error,
      touched,
      disabled = false,
      searchable = false,
      searchPlaceholder = 'Search...',
      className,
      size = 'md',
      required = false,
      clearable = false,
      helpText,
      helpTextPlacement = 'below',
      dropdownRef,
      onDisabledOptionInteract,
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = React.useState(false)
    const [searchQuery, setSearchQuery] = React.useState('')
    const [internalValue, setInternalValue] = React.useState(defaultValue || '')
    const [focusedIndex, setFocusedIndex] = React.useState(-1)
    const [dropdownRect, setDropdownRect] = React.useState<{
      top: number
      left: number
      width: number
    } | null>(null)

    const internalRef = React.useRef<HTMLDivElement>(null)
    const containerRef = dropdownRef || internalRef
    const searchInputRef = React.useRef<HTMLInputElement>(null)
    const listRef = React.useRef<HTMLDivElement>(null)
    const portalDropdownRef = React.useRef<HTMLDivElement>(null)

    // Combine refs
    React.useImperativeHandle(ref, () => containerRef.current as HTMLDivElement, [containerRef])

    const value = controlledValue !== undefined ? controlledValue : internalValue

    // Get flat options list for keyboard navigation
    const flatOptions = React.useMemo(() => flattenSelectOptions(options), [options])

    // Filter options based on search
    const filteredOptions = React.useMemo(
      () => filterSelectOptions(options, searchQuery),
      [options, searchQuery]
    )
    const enabledFilteredOptions = React.useMemo(
      () => flattenEnabledSelectOptions(filteredOptions),
      [filteredOptions]
    )
    const focusIndexByOption = React.useMemo(
      () => createSelectFocusIndexMap(filteredOptions),
      [filteredOptions]
    )

    // Get selected option
    const selectedOption = React.useMemo(() => {
      return flatOptions.find((opt) => opt.value === value)
    }, [flatOptions, value])

    // Handle selection
    const handleSelect = (optionValue: string) => {
      if (controlledValue === undefined) {
        setInternalValue(optionValue)
      }
      onChange?.(optionValue)
      setIsOpen(false)
      setSearchQuery('')
      setFocusedIndex(-1)
    }

    // Handle clear
    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation()
      if (controlledValue === undefined) {
        setInternalValue('')
      }
      onChange?.('')
    }

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (disabled) return

      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault()
          if (!isOpen) {
            setIsOpen(true)
          } else if (focusedIndex >= 0 && enabledFilteredOptions[focusedIndex]) {
            handleSelect(enabledFilteredOptions[focusedIndex].value)
          }
          break
        case 'ArrowDown':
          e.preventDefault()
          if (!isOpen) {
            setIsOpen(true)
          } else {
            setFocusedIndex((prev) => (prev < enabledFilteredOptions.length - 1 ? prev + 1 : 0))
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          if (isOpen) {
            setFocusedIndex((prev) => (prev > 0 ? prev - 1 : enabledFilteredOptions.length - 1))
          }
          break
        case 'Escape':
          setIsOpen(false)
          setSearchQuery('')
          setFocusedIndex(-1)
          break
        case 'Tab':
          if (isOpen) {
            setIsOpen(false)
            setSearchQuery('')
          }
          break
      }
    }

    // Update dropdown position when open (for Portal).
    React.useLayoutEffect(() => {
      if (isOpen && containerRef.current) {
        const updateRect = () => {
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            setDropdownRect({ top: rect.bottom + 8, left: rect.left, width: rect.width })
          }
        }
        updateRect()
        window.addEventListener('scroll', updateRect, true)
        window.addEventListener('resize', updateRect)
        return () => {
          window.removeEventListener('scroll', updateRect, true)
          window.removeEventListener('resize', updateRect)
        }
      } else {
        setDropdownRect(null)
      }
    }, [isOpen, containerRef])

    // Close on outside click (Portal: check both container and dropdown)
    React.useEffect(() => {
      if (!isOpen) return

      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Node
        const inContainer = containerRef.current?.contains(target)
        const inDropdown = portalDropdownRef.current?.contains(target)
        if (!inContainer && !inDropdown) {
          setIsOpen(false)
          setSearchQuery('')
          setFocusedIndex(-1)
        }
      }

      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen, containerRef])

    // Focus search input when opened
    React.useEffect(() => {
      if (isOpen && searchable && searchInputRef.current) {
        searchInputRef.current.focus({ preventScroll: true })
      }
    }, [isOpen, searchable])

    // Scroll focused option into view inside the list container (not the document).
    React.useEffect(() => {
      if (focusedIndex >= 0 && listRef.current) {
        const focusedEl = listRef.current.querySelector(`[data-index="${focusedIndex}"]`)
        if (focusedEl instanceof HTMLElement) {
          scrollElementIntoContainer(focusedEl, listRef.current, {
            block: 'nearest',
            behavior: 'auto',
          })
        }
      }
    }, [focusedIndex])

    const hasError = error && touched
    const state = disabled ? 'disabled' : hasError ? 'error' : isOpen ? 'focus' : 'default'
    const hasValue = !!value

    return (
      <div className={cn('relative', className)}>
        <div
          ref={containerRef}
          className="relative"
          onKeyDown={handleKeyDown}
          tabIndex={disabled ? -1 : 0}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-disabled={disabled}
        >
          {/* Trigger */}
          <div
            className={cn(selectTriggerVariants({ state, size }))}
            onClick={() => !disabled && setIsOpen(!isOpen)}
          >
            {/* Label */}
            {label && (
              <span
                className={cn(
                  selectLabelVariants({
                    state: hasValue || isOpen ? 'floated' : 'idle',
                    error: !!hasError,
                  })
                )}
              >
                {label}
                {required && <span className="text-destructive ml-1">*</span>}
              </span>
            )}

            {/* Value Display */}
            <div
              className={cn(
                'flex-1 text-left truncate',
                label && (hasValue || isOpen) && 'pt-4',
                hasValue ? 'text-foreground' : 'text-foreground/50'
              )}
            >
              {selectedOption ? (
                <div className="flex items-center gap-2">
                  {selectedOption.icon}
                  <span>{selectedOption.label}</span>
                </div>
              ) : (
                !label && placeholder
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              {clearable && hasValue && !disabled && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1 rounded-md hover:bg-foreground/10 transition-colors"
                  aria-label="Clear selection"
                >
                  <X className="w-4 h-4 text-foreground/50" />
                </button>
              )}
              <ChevronDown
                className={cn(
                  'w-5 h-5 text-foreground/50 transition-transform duration-200',
                  isOpen && 'rotate-180'
                )}
              />
            </div>
          </div>

          {/* Dropdown - Portal to escape overflow (Clarity parity) */}
          {typeof document !== 'undefined' &&
            isOpen &&
            dropdownRect &&
            createPortal(
              <motion.div
                ref={portalDropdownRef}
                variants={dropdownVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className={cn(selectDropdownClassName)}
                style={{
                  top: dropdownRect.top,
                  left: dropdownRect.left,
                  width: dropdownRect.width,
                }}
              >
                {/* Search Input */}
                {searchable && (
                  <div className="p-2 border-b border-foreground/[0.05]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value)
                          setFocusedIndex(-1)
                        }}
                        placeholder={searchPlaceholder}
                        className={cn(selectSearchInputClassName)}
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-foreground/10"
                        >
                          <X className="w-3 h-3 text-foreground/50" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Options List */}
                <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
                  {filteredOptions.length === 0 ? (
                    <div className="px-4 py-8 text-center text-foreground/50 text-sm">
                      No options found
                    </div>
                  ) : isGroupedOptions(filteredOptions) ? (
                    // Grouped options
                    filteredOptions.map((group, groupIndex) => (
                      <div key={group.label} className={groupIndex > 0 ? 'mt-2' : ''}>
                        <div className="px-4 py-2 text-xs font-semibold text-foreground/50 uppercase tracking-wider">
                          {group.label}
                        </div>
                        {group.options.map((option) => {
                          const focusIndex = focusIndexByOption.get(option)

                          return (
                            <SelectOptionItem
                              key={option.value}
                              option={option}
                              isSelected={option.value === value}
                              isFocused={focusIndex !== undefined && focusedIndex === focusIndex}
                              dataIndex={focusIndex}
                              onSelect={handleSelect}
                              onDisabledOptionInteract={onDisabledOptionInteract}
                            />
                          )
                        })}
                      </div>
                    ))
                  ) : (
                    // Flat options
                    filteredOptions.map((option) => (
                      <SelectOptionItem
                        key={option.value}
                        option={option}
                        isSelected={option.value === value}
                        isFocused={
                          focusIndexByOption.has(option) &&
                          focusedIndex === focusIndexByOption.get(option)
                        }
                        dataIndex={focusIndexByOption.get(option)}
                        onSelect={handleSelect}
                        onDisabledOptionInteract={onDisabledOptionInteract}
                      />
                    ))
                  )}
                </div>
              </motion.div>,
              document.body
            )}
        </div>

        {/* Help Text */}
        {helpText && helpTextPlacement === 'below' && !hasError && (
          <p className="text-xs text-foreground/50 mt-2 leading-relaxed">{helpText}</p>
        )}

        {/* Error Message */}
        {hasError && (
          <div className="flex items-center gap-1.5 mt-1.5 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    )
  }
)
AuroraSelect.displayName = 'AuroraSelect'

// ─────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────

export type {
  SelectGroup as SelectGroupType,
  SelectOption as SelectOptionType,
} from './Select.types'
