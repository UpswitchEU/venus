/**
 * Aurora Design System
 * Select / Dropdown Component
 *
 * Searchable dropdown with grouped options, following Hybrid Aurora patterns.
 * Uses floating labels, spring animations, and glass-morphism styling.
 *
 * Compatible with existing Venus CustomDropdown props.
 */

import { cva, type VariantProps } from 'class-variance-authority'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Check, ChevronDown, Search, X } from 'lucide-react'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'
import { springDefault } from './motion'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  description?: string
  icon?: React.ReactNode
}

export interface SelectGroup {
  label: string
  options: SelectOption[]
}

export type SelectOptions = SelectOption[] | SelectGroup[]

function isGroupedOptions(options: SelectOptions): options is SelectGroup[] {
  return options.length > 0 && 'options' in options[0]
}

// ─────────────────────────────────────────
// ANIMATION VARIANTS
// ─────────────────────────────────────────

const dropdownVariants = {
  hidden: {
    opacity: 0,
    y: -8,
    scale: 0.98,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: springDefault,
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.98,
    transition: { duration: 0.15 },
  },
}

// ─────────────────────────────────────────
// STYLE VARIANTS
// ─────────────────────────────────────────

const selectTriggerVariants = cva(
  [
    'relative w-full flex items-center justify-between',
    'border rounded-xl shadow-sm transition-all duration-200',
    'bg-foreground/[0.04]',
    'cursor-pointer select-none',
  ],
  {
    variants: {
      state: {
        default: 'border-foreground/[0.10] hover:border-foreground/[0.20]',
        focus: 'border-primary ring-2 ring-primary/20 ring-offset-0',
        error: 'border-destructive',
        disabled: 'border-foreground/[0.05] opacity-60 cursor-not-allowed',
      },
      size: {
        sm: 'h-14 px-4',
        md: 'h-16 px-4',
        lg: 'h-[72px] px-4',
      },
    },
    defaultVariants: {
      state: 'default',
      size: 'md',
    },
  }
)

const labelVariants = cva(
  [
    'absolute left-4 transition-all duration-200 ease-in-out pointer-events-none',
    'text-foreground/60',
  ],
  {
    variants: {
      state: {
        idle: 'top-1/2 -translate-y-1/2 text-base',
        floated: 'top-2 translate-y-0 text-xs font-medium',
      },
      error: {
        true: 'text-destructive',
        false: '',
      },
    },
    defaultVariants: {
      state: 'idle',
      error: false,
    },
  }
)

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
    React.useImperativeHandle(ref, () => containerRef.current!)

    const value = controlledValue !== undefined ? controlledValue : internalValue

    // Get flat options list for keyboard navigation
    const flatOptions = React.useMemo(() => {
      if (isGroupedOptions(options)) {
        return options.flatMap((group) => group.options)
      }
      return options
    }, [options])

    // Filter options based on search
    const filteredOptions = React.useMemo(() => {
      if (!searchQuery) return options

      const query = searchQuery.toLowerCase()

      if (isGroupedOptions(options)) {
        return options
          .map((group) => ({
            ...group,
            options: group.options.filter(
              (opt) =>
                opt.label.toLowerCase().includes(query) ||
                opt.description?.toLowerCase().includes(query)
            ),
          }))
          .filter((group) => group.options.length > 0)
      }

      return options.filter(
        (opt) =>
          opt.label.toLowerCase().includes(query) || opt.description?.toLowerCase().includes(query)
      )
    }, [options, searchQuery])

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

      const filteredFlat = isGroupedOptions(filteredOptions)
        ? filteredOptions.flatMap((g) => g.options).filter((o) => !o.disabled)
        : filteredOptions.filter((o) => !o.disabled)

      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault()
          if (!isOpen) {
            setIsOpen(true)
          } else if (focusedIndex >= 0 && filteredFlat[focusedIndex]) {
            handleSelect(filteredFlat[focusedIndex].value)
          }
          break
        case 'ArrowDown':
          e.preventDefault()
          if (!isOpen) {
            setIsOpen(true)
          } else {
            setFocusedIndex((prev) => (prev < filteredFlat.length - 1 ? prev + 1 : 0))
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          if (isOpen) {
            setFocusedIndex((prev) => (prev > 0 ? prev - 1 : filteredFlat.length - 1))
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

    // Update dropdown position when open (for Portal)
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
    }, [isOpen])

    // Close on outside click (Portal: check both container and dropdown)
    React.useEffect(() => {
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
    }, [])

    // Focus search input when opened
    React.useEffect(() => {
      if (isOpen && searchable && searchInputRef.current) {
        searchInputRef.current.focus()
      }
    }, [isOpen, searchable])

    // Scroll focused option into view
    React.useEffect(() => {
      if (focusedIndex >= 0 && listRef.current) {
        const focusedEl = listRef.current.querySelector(`[data-index="${focusedIndex}"]`)
        focusedEl?.scrollIntoView({ block: 'nearest' })
      }
    }, [focusedIndex])

    const hasError = error && touched
    const state = disabled ? 'disabled' : hasError ? 'error' : isOpen ? 'focus' : 'default'
    const hasValue = !!value

    return (
      <div ref={ref} className={cn('relative', className)}>
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
                  labelVariants({
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
                className={cn(
                  'fixed z-[9999]',
                  'bg-background border border-foreground/[0.10] rounded-xl',
                  'shadow-2xl shadow-black/20',
                  'overflow-hidden'
                )}
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
                        className={cn(
                          'w-full h-10 pl-9 pr-4 text-sm',
                          'bg-foreground/[0.04] border border-foreground/[0.08] rounded-lg',
                          'text-foreground placeholder:text-foreground/40',
                          'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'
                        )}
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
                          const flatIndex =
                            filteredOptions
                              .slice(0, groupIndex)
                              .reduce((acc, g) => acc + g.options.length, 0) +
                            group.options.indexOf(option)

                          return (
                            <SelectOptionItem
                              key={option.value}
                              option={option}
                              isSelected={option.value === value}
                              isFocused={focusedIndex === flatIndex}
                              dataIndex={flatIndex}
                              onSelect={handleSelect}
                              onDisabledOptionInteract={onDisabledOptionInteract}
                            />
                          )
                        })}
                      </div>
                    ))
                  ) : (
                    // Flat options
                    filteredOptions.map((option, index) => (
                      <SelectOptionItem
                        key={option.value}
                        option={option}
                        isSelected={option.value === value}
                        isFocused={focusedIndex === index}
                        dataIndex={index}
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
// OPTION ITEM
// ─────────────────────────────────────────

const HOVER_DEBOUNCE_MS = 5000

interface SelectOptionItemProps {
  option: SelectOption
  isSelected: boolean
  isFocused: boolean
  dataIndex: number
  onSelect: (value: string) => void
  onDisabledOptionInteract?: (value: string, action: 'click' | 'hover') => void
}

const SelectOptionItem: React.FC<SelectOptionItemProps> = ({
  option,
  isSelected,
  isFocused,
  dataIndex,
  onSelect,
  onDisabledOptionInteract,
}) => {
  const lastHoverRef = React.useRef<Record<string, number>>({})
  const descId = React.useId()

  const handleClick = () => {
    if (option.disabled) {
      onDisabledOptionInteract?.(option.value, 'click')
    } else {
      onSelect(option.value)
    }
  }

  const handleMouseEnter = () => {
    if (option.disabled && onDisabledOptionInteract) {
      const now = Date.now()
      const last = lastHoverRef.current[option.value] ?? 0
      if (now - last >= HOVER_DEBOUNCE_MS) {
        lastHoverRef.current[option.value] = now
        onDisabledOptionInteract(option.value, 'hover')
      }
    }
  }

  const hasDescription = option.disabled && option.description

  return (
    <div
      data-index={dataIndex}
      role="option"
      aria-selected={isSelected}
      aria-disabled={option.disabled}
      aria-describedby={hasDescription ? descId : undefined}
      className={cn(
        'px-4 py-2.5 cursor-pointer transition-colors',
        'flex items-center gap-3',
        option.disabled && 'opacity-50 cursor-not-allowed',
        !option.disabled && (isFocused || isSelected) && 'bg-primary/10',
        !option.disabled && !isFocused && !isSelected && 'hover:bg-foreground/[0.04]'
      )}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
    >
      {option.icon && <span className="shrink-0 text-foreground/60">{option.icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground truncate">{option.label}</div>
        {option.description && (
          <div id={descId} className="text-xs text-foreground/50 truncate">
            {option.description}
          </div>
        )}
      </div>
      {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
    </div>
  )
}

// ─────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────

export type { SelectOption as SelectOptionType, SelectGroup as SelectGroupType }
