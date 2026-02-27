'use client'

/**
 * Entity Search Components
 *
 * KBO Company Search and Business Type Search with fuzzy matching,
 * floating labels, and design system integration.
 *
 * Clarity parity: Business type dropdown uses Portal + z-[9999] to escape
 * overflow/stacking (ManualLayout has overflow-hidden). KBO uses z-[9999].
 */

import { cva, type VariantProps } from 'class-variance-authority'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BookOpen,
  Briefcase,
  Building2,
  Camera,
  Car,
  Check,
  ChevronDown,
  Coffee,
  Cpu,
  Factory,
  Globe,
  GraduationCap,
  Hammer,
  Heart,
  Home,
  Landmark,
  Leaf,
  Loader2,
  type LucideIcon,
  Music,
  Palette,
  Plane,
  Scale,
  Scissors,
  Search,
  Shield,
  ShoppingCart,
  Stethoscope,
  Store,
  Truck,
  Utensils,
  Wifi,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { looksLikeNaceCode } from '@/services/naceBusinessTypeService'
import { cn, safeString } from '../utils'

// ─────────────────────────────────────────
// SHARED STYLE VARIANTS
// ─────────────────────────────────────────

const searchContainerVariants = cva('relative w-full transition-all duration-200', {
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

const searchGroupVariants = cva(
  ['relative border rounded-xl shadow-sm transition-all duration-200', 'bg-muted'],
  {
    variants: {
      state: {
        default: 'border-foreground/[0.10] hover:border-foreground/[0.20]',
        focus: 'border-primary ring-2 ring-primary/20 ring-offset-0',
        success: 'border-primary ring-2 ring-primary/20',
        error: 'border-destructive',
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

const searchFieldVariants = cva(
  [
    'w-full border-none rounded-xl',
    'bg-transparent',
    'disabled:bg-muted',
    'focus:outline-none focus:ring-0',
    'transition-all duration-200 ease-in-out',
    'placeholder:text-transparent',
    'text-foreground',
    'disabled:cursor-not-allowed',
  ],
  {
    variants: {
      size: {
        sm: 'h-14 px-4 pt-6 pb-2 text-sm pl-14',
        md: 'h-16 px-4 pt-6 pb-2 text-base pl-14',
        lg: 'h-[72px] px-4 pt-7 pb-2 text-lg pl-14',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

const floatingLabelVariants = cva(
  ['absolute transition-all duration-200 ease-in-out pointer-events-none', 'origin-left'],
  {
    variants: {
      state: {
        default: 'text-foreground/50',
        focus: 'text-primary',
        success: 'text-primary',
        error: 'text-destructive',
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
      { floated: false, size: 'sm', className: 'top-4 text-sm left-14' },
      { floated: true, size: 'sm', className: 'top-2 text-[11px] font-medium left-14' },
      { floated: false, size: 'md', className: 'top-5 text-base left-14' },
      { floated: true, size: 'md', className: 'top-2 text-xs font-medium left-14' },
      { floated: false, size: 'lg', className: 'top-6 text-lg left-14' },
      { floated: true, size: 'lg', className: 'top-2.5 text-xs font-medium left-14' },
    ],
    defaultVariants: {
      state: 'default',
      floated: false,
      size: 'md',
    },
  }
)

const dropdownVariants = {
  hidden: { opacity: 0, y: -8, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.15, ease: 'easeOut' as const },
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.98,
    transition: { duration: 0.1, ease: 'easeIn' as const },
  },
}

// ─────────────────────────────────────────
// KBO COMPANY TYPES
// ─────────────────────────────────────────

export interface KBOCompany {
  id: string
  name: string
  kboNumber: string
  legalForm: string
  address: string
  postalCode: string
  city: string
  startDate?: string
  naceCode?: string
  naceDescription?: string
  /** Website URL for screenshot feature */
  website?: string
}

export interface KBOSearchInputProps extends VariantProps<typeof searchFieldVariants> {
  /** Floating label text */
  label?: string
  /** Placeholder text */
  placeholder?: string
  /** Current search value */
  value: string
  /** Change handler */
  onChange: (value: string) => void
  /** Company selection handler */
  onCompanySelect: (company: KBOCompany) => void
  /** Currently selected company */
  selectedCompany: KBOCompany | null
  /** Clear selection handler */
  onClear: () => void
  /** Custom search function (signal for request cancellation on rapid typing) */
  searchFn?: (query: string, signal?: AbortSignal) => Promise<KBOCompany[]> | KBOCompany[]
  /** Minimum query length to trigger search */
  minQueryLength?: number
  /** Debounce delay in ms */
  debounceMs?: number
  /** Container className */
  className?: string
  /** Disabled state */
  disabled?: boolean
}

function defaultKBOSearch(_query: string, _signal?: AbortSignal): KBOCompany[] {
  return []
}

export const KBOSearchInput = React.forwardRef<HTMLInputElement, KBOSearchInputProps>(
  (
    {
      label,
      placeholder,
      value,
      onChange,
      onCompanySelect,
      selectedCompany,
      onClear,
      searchFn = defaultKBOSearch,
      minQueryLength = 2,
      debounceMs = 300,
      size = 'md',
      className,
      disabled,
    },
    ref
  ) => {
    const t = useTranslations('integrationStep')
    const inputId = React.useId()
    const displayLabel = label ?? t('companyNameOrKbo')
    const displayPlaceholder = placeholder ?? t('searchPlaceholder')
    const [isFocused, setIsFocused] = React.useState(false)
    const [isSearching, setIsSearching] = React.useState(false)
    const [results, setResults] = React.useState<KBOCompany[]>([])
    const [searchError, setSearchError] = React.useState<string | null>(null)
    const [retryTrigger, setRetryTrigger] = React.useState(0)
    const [showDropdown, setShowDropdown] = React.useState(false)
    const [focusedIndex, setFocusedIndex] = React.useState(-1)
    const [dropdownRect, setDropdownRect] = React.useState<{
      top: number
      left: number
      width: number
    } | null>(null)
    const inputRef = React.useRef<HTMLInputElement>(null)
    const containerRef = React.useRef<HTMLDivElement>(null)
    const dropdownRef = React.useRef<HTMLDivElement>(null)
    const abortControllerRef = React.useRef<AbortController | null>(null)
    const timedOutRef = React.useRef(false)

    React.useImperativeHandle(ref, () => inputRef.current!)

    const canSearch = !selectedCompany && value.length >= minQueryLength
    const shouldShowDropdown =
      !disabled && !selectedCompany && isFocused && value.length >= minQueryLength

    // Update dropdown position when open (for Portal)
    React.useLayoutEffect(() => {
      if (shouldShowDropdown && canSearch && containerRef.current) {
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
    }, [shouldShowDropdown, canSearch])

    // Debounced search with request cancellation and 8s timeout
    const REQUEST_TIMEOUT_MS = 8000
    React.useEffect(() => {
      if (selectedCompany) {
        setResults([])
        setShowDropdown(false)
        setSearchError(null)
        return
      }

      if (value.length < minQueryLength) {
        setResults([])
        setSearchError(null)
        return
      }

      setIsSearching(true)
      setSearchError(null)
      setShowDropdown(true)

      const timeout = setTimeout(async () => {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }
        const controller = new AbortController()
        abortControllerRef.current = controller
        timedOutRef.current = false

        const timeoutId = setTimeout(() => {
          timedOutRef.current = true
          controller.abort()
        }, REQUEST_TIMEOUT_MS)

        try {
          const found = await searchFn(value, controller.signal)
          clearTimeout(timeoutId)
          if (!controller.signal.aborted) {
            setResults(found)
            setShowDropdown(true)
            setSearchError(null)
          }
        } catch (err) {
          clearTimeout(timeoutId)
          if (err instanceof DOMException && err.name === 'AbortError' && !timedOutRef.current)
            return
          if (controller.signal.aborted && !timedOutRef.current) return

          setResults([])
          setSearchError(
            timedOutRef.current
              ? t('searchUnavailable')
              : err instanceof Error && err.message
                ? err.message
                : t('searchUnavailable')
          )
          setShowDropdown(true)
        } finally {
          setIsSearching(false)
        }
      }, debounceMs)

      return () => {
        clearTimeout(timeout)
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
          abortControllerRef.current = null
        }
      }
    }, [value, selectedCompany, searchFn, minQueryLength, debounceMs, retryTrigger])

    // Close on outside click (Portal: check both container and dropdown)
    React.useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
        const target = e.target as Node
        const inContainer = containerRef.current?.contains(target)
        const inDropdown = dropdownRef.current?.contains(target)
        if (!inContainer && !inDropdown) {
          setShowDropdown(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (!showDropdown) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setFocusedIndex((prev) => Math.min(prev + 1, results.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setFocusedIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (focusedIndex >= 0 && results[focusedIndex]) {
            handleSelect(results[focusedIndex])
          }
          break
        case 'Escape':
          setShowDropdown(false)
          break
      }
    }

    const handleSelect = (company: KBOCompany) => {
      onCompanySelect(company)
      onChange(safeString(company.name))
      setShowDropdown(false)
      setFocusedIndex(-1)
    }

    const handleClear = () => {
      onClear()
      onChange('')
      setResults([])
      inputRef.current?.focus()
    }

    const hasValue = Boolean(value) || Boolean(selectedCompany)
    const isFloated = isFocused || hasValue
    const state = disabled
      ? 'disabled'
      : selectedCompany
        ? 'success'
        : isFocused
          ? 'focus'
          : 'default'

    const showDidYouMean =
      results.length > 0 &&
      value.length >= 3 &&
      !results.some((r) => r.name.toLowerCase().startsWith(value.toLowerCase()))

    return (
      <div ref={containerRef} className={cn(searchContainerVariants({ size }), className)}>
        <div
          className={cn(searchGroupVariants({ state, size }))}
          onMouseDown={(e) => {
            // Make the whole control behave like a single clickable field
            // (important for "click label" and empty area clicks).
            if (disabled || selectedCompany) return
            const target = e.target as HTMLElement
            // Don't steal clicks from buttons.
            if (target.closest('button')) return
            // Prevent focus flicker caused by mousedown on wrapper.
            e.preventDefault()
            inputRef.current?.focus()
          }}
        >
          {/* Search Icon */}
          <div
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 z-10',
              state === 'success'
                ? 'text-primary'
                : isFocused
                  ? 'text-primary'
                  : 'text-foreground/50'
            )}
          >
            {selectedCompany ? (
              <Check className="w-5 h-5" />
            ) : isSearching ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Search className="w-5 h-5" />
            )}
          </div>

          {/* Input Field */}
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={selectedCompany ? safeString(selectedCompany.name) : value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => {
              setIsFocused(true)
              if (!selectedCompany) setShowDropdown(true)
            }}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            disabled={disabled || !!selectedCompany}
            placeholder=" "
            className={cn(searchFieldVariants({ size }))}
          />

          {/* Floating Label */}
          <label
            htmlFor={inputId}
            className={cn(
              floatingLabelVariants({ state, floated: isFloated, size }),
              // Ensure label clicks focus input ("click label" UX).
              // This overrides the base pointer-events-none from the variant.
              'pointer-events-auto cursor-text'
            )}
          >
            {displayLabel}
          </label>

          {/* Right Side Icons */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5">
            {selectedCompany && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 rounded-full text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5 transition-colors"
                aria-label={t('clear')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {!selectedCompany && value && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="p-1 rounded-full text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5 transition-colors"
                aria-label={t('clear')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Helper text to avoid "nothing happens" dead-end */}
        {!selectedCompany && !disabled && value.length > 0 && value.length < minQueryLength && (
          <p className="mt-2 text-xs text-foreground/50">
            {t('minCharsHint', { count: minQueryLength })}
          </p>
        )}

        {/* Search Results Dropdown - Portal to escape overflow (Clarity parity) */}
        {typeof document !== 'undefined' &&
          !disabled &&
          !selectedCompany &&
          isFocused &&
          value.length >= minQueryLength &&
          dropdownRect &&
          createPortal(
            <motion.div
              ref={dropdownRef}
              variants={dropdownVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onMouseDown={(e) => e.preventDefault()}
              role="listbox"
              aria-label={displayLabel}
              aria-activedescendant={
                focusedIndex >= 0 && results[focusedIndex]
                  ? `kbo-option-${results[focusedIndex].id}`
                  : undefined
              }
              className={cn(
                'fixed z-[9999]',
                'bg-background border border-foreground/[0.10] rounded-xl shadow-xl',
                'overflow-hidden max-h-80 overflow-y-auto'
              )}
              style={{
                top: dropdownRect.top,
                left: dropdownRect.left,
                width: dropdownRect.width,
              }}
            >
              {showDidYouMean && (
                <div className="px-3 py-2 border-b border-foreground/[0.06] bg-foreground/[0.02]">
                  <span className="text-xs font-medium text-foreground/50">{t('didYouMean')}</span>
                </div>
              )}

              {isSearching ? (
                <div className="px-4 py-6 text-sm text-foreground/50 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('searching')}
                </div>
              ) : searchError ? (
                <div className="px-4 py-4 text-sm">
                  <p className="text-destructive/80 mb-1">{t('searchFailed')}</p>
                  <p className="text-foreground/40 text-xs mb-3">{searchError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchError(null)
                      setRetryTrigger((prev) => prev + 1)
                    }}
                    className="text-xs font-medium text-primary hover:text-primary/80"
                  >
                    {t('tryAgain')}
                  </button>
                </div>
              ) : results.length === 0 ? (
                <div className="px-4 py-4 text-sm text-foreground/50">
                  <p>{t('noCompaniesFound')}</p>
                  {value.length >= 3 && (
                    <button
                      type="button"
                      onClick={() => setRetryTrigger((prev) => prev + 1)}
                      className="mt-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      {t('unexpectedResultRetry')}
                    </button>
                  )}
                </div>
              ) : (
                results.map((company, index) => (
                  <button
                    key={company.id}
                    id={`kbo-option-${company.id}`}
                    type="button"
                    ref={
                      index === focusedIndex
                        ? (el) => el?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
                        : undefined
                    }
                    onClick={() => handleSelect(company)}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-3 text-left transition-colors',
                      'hover:bg-foreground/[0.04]',
                      focusedIndex === index && 'bg-foreground/[0.06]',
                      index !== results.length - 1 && 'border-b border-foreground/[0.04]'
                    )}
                    role="option"
                    aria-selected={focusedIndex === index}
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {safeString(company.name)}
                        </span>
                        <span className="text-[10px] font-mono text-foreground/40 bg-foreground/[0.04] px-1.5 py-0.5 rounded shrink-0">
                          {safeString(company.legalForm)}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/50 mt-0.5">
                        {safeString(company.kboNumber)} · {safeString(company.city)}
                      </p>
                      {safeString(company.naceDescription) && (
                        <p className="text-[11px] text-foreground/40 mt-0.5 truncate">
                          {safeString(company.naceDescription)}
                        </p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </motion.div>,
            document.body
          )}

        {/* Selected Company Card */}
        <AnimatePresence>
          {selectedCompany && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-3 p-3 rounded-xl bg-primary/5 border border-primary/20"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {safeString(selectedCompany.name)}
                    </p>
                    <span className="text-[10px] font-mono text-foreground/40 bg-foreground/[0.04] px-1.5 py-0.5 rounded">
                      {safeString(selectedCompany.legalForm)}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/50 mt-0.5">
                    {safeString(selectedCompany.kboNumber)}
                  </p>
                  <p className="text-xs text-foreground/40 mt-0.5">
                    {safeString(selectedCompany.address)}, {safeString(selectedCompany.postalCode)}{' '}
                    {safeString(selectedCompany.city)}
                  </p>
                  {safeString(selectedCompany.naceDescription) && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="text-[10px] font-mono text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">
                        NACE {safeString(selectedCompany.naceCode)}
                      </span>
                      <span className="text-[11px] text-foreground/50 truncate">
                        {safeString(selectedCompany.naceDescription)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }
)
KBOSearchInput.displayName = 'KBOSearchInput'

// ─────────────────────────────────────────
// BUSINESS TYPE TYPES
// ─────────────────────────────────────────

export interface BusinessType {
  id: string
  code: string
  name: string
  category: string
  icon: LucideIcon
  emoji?: string
  description?: string
  /** When true, shown first when dropdown opens with empty search (Mercury/Clarity parity) */
  popular?: boolean
}

// Category to emoji mapping (same as BusinessCard)
const categoryEmojis: Record<string, string> = {
  technology: '\u{1F4BB}',
  software: '\u{1F310}',
  creative: '\u{1F3A8}',
  retail: '\u{1F6CD}\uFE0F',
  ecommerce: '\u{1F6D2}',
  food: '\u{1F37D}\uFE0F',
  hospitality: '\u2615',
  manufacturing: '\u{1F3ED}',
  logistics: '\u{1F69A}',
  healthcare: '\u{1F3E5}',
  education: '\u{1F393}',
  realestate: '\u{1F3E0}',
  construction: '\u{1F528}',
  services: '\u{1F527}',
  consulting: '\u{1F4BC}',
  finance: '\u{1F3E6}',
  legal: '\u2696\uFE0F',
  agriculture: '\u{1F331}',
  beauty: '\u2702\uFE0F',
  automotive: '\u{1F697}',
  energy: '\u26A1',
  travel: '\u2708\uFE0F',
  entertainment: '\u{1F3B5}',
  media: '\u{1F4F7}',
  security: '\u{1F6E1}\uFE0F',
  telecom: '\u{1F4E1}',
  publishing: '\u{1F4DA}',
  nonprofit: '\u2764\uFE0F',
  other: '\u{1F3E2}',
}

const categoryIcons: Record<string, LucideIcon> = {
  technology: Cpu,
  software: Globe,
  creative: Palette,
  retail: Store,
  ecommerce: ShoppingCart,
  food: Utensils,
  hospitality: Coffee,
  manufacturing: Factory,
  logistics: Truck,
  healthcare: Stethoscope,
  education: GraduationCap,
  realestate: Home,
  construction: Hammer,
  services: Wrench,
  consulting: Briefcase,
  finance: Landmark,
  legal: Scale,
  agriculture: Leaf,
  energy: Zap,
  travel: Plane,
  entertainment: Music,
  media: Camera,
  beauty: Scissors,
  automotive: Car,
  security: Shield,
  telecom: Wifi,
  publishing: BookOpen,
  nonprofit: Heart,
  other: Building2,
}

// Business types (sample - full list from DB)
const businessTypes: BusinessType[] = [
  {
    id: 'tech-01',
    code: '62.010',
    name: 'Softwareontwikkeling',
    category: 'technology',
    icon: Cpu,
    description: 'Custom software development',
  },
  {
    id: 'tech-02',
    code: '62.020',
    name: 'IT-consultancy',
    category: 'technology',
    icon: Briefcase,
    description: 'Technology consulting services',
  },
  {
    id: 'tech-03',
    code: '63.110',
    name: 'Dataverwerking & hosting',
    category: 'software',
    icon: Globe,
    description: 'Data processing and web hosting',
  },
  {
    id: 'creat-01',
    code: '73.110',
    name: 'Reclamebureau',
    category: 'creative',
    icon: Palette,
    description: 'Advertising agency',
  },
  {
    id: 'creat-02',
    code: '74.201',
    name: 'Fotografie',
    category: 'creative',
    icon: Camera,
    description: 'Photography services',
  },
  {
    id: 'creat-03',
    code: '74.209',
    name: 'Grafisch ontwerp',
    category: 'creative',
    icon: Palette,
    description: 'Graphic design',
  },
  {
    id: 'ret-01',
    code: '47.110',
    name: 'Supermarkt',
    category: 'retail',
    icon: Store,
    description: 'Supermarket retail',
  },
  {
    id: 'ret-02',
    code: '47.710',
    name: 'Kledingwinkel',
    category: 'retail',
    icon: Store,
    description: 'Clothing retail',
  },
  {
    id: 'ret-03',
    code: '47.910',
    name: 'Webwinkel',
    category: 'ecommerce',
    icon: ShoppingCart,
    description: 'E-commerce retail',
  },
  {
    id: 'food-01',
    code: '56.101',
    name: 'Restaurant',
    category: 'food',
    icon: Utensils,
    description: 'Restaurant services',
  },
  {
    id: 'food-02',
    code: '56.102',
    name: 'Brasserie & Bistro',
    category: 'food',
    icon: Coffee,
    description: 'Casual dining',
  },
  {
    id: 'food-03',
    code: '56.301',
    name: 'Caf\u00e9',
    category: 'hospitality',
    icon: Coffee,
    description: 'Caf\u00e9 and bar',
  },
  {
    id: 'food-04',
    code: '10.710',
    name: 'Bakkerij',
    category: 'food',
    icon: Utensils,
    description: 'Bakery',
  },
  {
    id: 'food-05',
    code: '10.130',
    name: 'Slagerij',
    category: 'food',
    icon: Utensils,
    description: 'Butcher shop',
  },
  {
    id: 'mfg-01',
    code: '25.110',
    name: 'Metaalconstructie',
    category: 'manufacturing',
    icon: Factory,
    description: 'Metal construction',
  },
  {
    id: 'mfg-02',
    code: '31.010',
    name: 'Meubelproductie',
    category: 'manufacturing',
    icon: Factory,
    description: 'Furniture manufacturing',
  },
  {
    id: 'log-01',
    code: '49.410',
    name: 'Goederenvervoer',
    category: 'logistics',
    icon: Truck,
    description: 'Freight transport',
  },
  {
    id: 'log-02',
    code: '52.100',
    name: 'Opslag & warehousing',
    category: 'logistics',
    icon: Truck,
    description: 'Warehousing services',
  },
  {
    id: 'health-01',
    code: '86.210',
    name: 'Huisartsenpraktijk',
    category: 'healthcare',
    icon: Stethoscope,
    description: 'General practice',
  },
  {
    id: 'health-02',
    code: '86.230',
    name: 'Tandartspraktijk',
    category: 'healthcare',
    icon: Stethoscope,
    description: 'Dental practice',
  },
  {
    id: 'health-03',
    code: '86.901',
    name: 'Fysiotherapie',
    category: 'healthcare',
    icon: Heart,
    description: 'Physiotherapy',
  },
  {
    id: 'prof-01',
    code: '69.101',
    name: 'Advocatenkantoor',
    category: 'legal',
    icon: Scale,
    description: 'Law firm',
  },
  {
    id: 'prof-02',
    code: '69.201',
    name: 'Accountantskantoor',
    category: 'finance',
    icon: Landmark,
    description: 'Accounting firm',
  },
  {
    id: 'prof-03',
    code: '70.220',
    name: 'Managementadvies',
    category: 'consulting',
    icon: Briefcase,
    description: 'Management consulting',
  },
  {
    id: 'prof-04',
    code: '71.111',
    name: 'Architectenbureau',
    category: 'consulting',
    icon: Home,
    description: 'Architecture firm',
  },
  {
    id: 'con-01',
    code: '41.201',
    name: 'Woningbouw',
    category: 'construction',
    icon: Home,
    description: 'Residential construction',
  },
  {
    id: 'con-02',
    code: '43.210',
    name: 'Elektrotechniek',
    category: 'construction',
    icon: Zap,
    description: 'Electrical installation',
  },
  {
    id: 'con-03',
    code: '43.220',
    name: 'Loodgieterij',
    category: 'construction',
    icon: Wrench,
    description: 'Plumbing',
  },
  {
    id: 'beauty-01',
    code: '96.021',
    name: 'Kapsalon',
    category: 'beauty',
    icon: Scissors,
    description: 'Hair salon',
  },
  {
    id: 'beauty-02',
    code: '96.022',
    name: 'Schoonheidssalon',
    category: 'beauty',
    icon: Scissors,
    description: 'Beauty salon',
  },
  {
    id: 'auto-01',
    code: '45.111',
    name: 'Autohandel',
    category: 'automotive',
    icon: Car,
    description: 'Car dealership',
  },
  {
    id: 'auto-02',
    code: '45.200',
    name: 'Autogarage',
    category: 'automotive',
    icon: Car,
    description: 'Auto repair',
  },
  {
    id: 're-01',
    code: '68.310',
    name: 'Vastgoedmakelaar',
    category: 'realestate',
    icon: Home,
    description: 'Real estate brokerage',
  },
  {
    id: 're-02',
    code: '68.320',
    name: 'Vastgoedbeheer',
    category: 'realestate',
    icon: Home,
    description: 'Property management',
  },
]

const categoryLabels: Record<string, string> = {
  technology: 'Technologie',
  software: 'Software',
  creative: 'Creatief',
  retail: 'Retail',
  ecommerce: 'E-commerce',
  food: 'Voeding',
  hospitality: 'Horeca',
  manufacturing: 'Productie',
  logistics: 'Logistiek',
  healthcare: 'Zorg',
  education: 'Onderwijs',
  realestate: 'Vastgoed',
  construction: 'Bouw',
  services: 'Diensten',
  consulting: 'Advies',
  finance: 'Financieel',
  legal: 'Juridisch',
  agriculture: 'Landbouw',
  beauty: 'Verzorging',
  automotive: 'Automotive',
  other: 'Overig',
}

/** Humanize slug for display when types not yet loaded (e.g. "restaurant" -> "Restaurant") */
function humanizeBusinessTypeSlug(slug: string): string {
  if (!slug?.trim()) return ''
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export interface BusinessTypeSearchInputProps extends VariantProps<typeof searchFieldVariants> {
  /** Floating label text */
  label?: string
  /** Current value (business type ID) */
  value: string
  /** Change handler */
  onChange: (value: string, businessType?: BusinessType) => void
  /** Container className */
  className?: string
  /** Disabled state */
  disabled?: boolean
  /** Custom business types list */
  types?: BusinessType[]
  /** NACE-matched type ID to show first when dropdown opens (from KBO) */
  naceMatchedTypeId?: string
  /** Loading state (e.g. types API not yet loaded) - shows subtle pulse when value exists */
  loading?: boolean
  /** Error when loading types failed - shows retry UI in dropdown */
  loadError?: string | null
  /** Callback to retry loading types */
  onRetryLoad?: () => void
}

function normalizeForSearch(s: string): string {
  return s.toLowerCase().replace(/[-_.\s]/g, '')
}

function fuzzySearchBusinessTypes(
  query: string,
  types: BusinessType[],
  prioritizedId?: string
): { types: BusinessType[]; isDidYouMean: boolean } {
  if (!query) {
    const sorted = [...types].sort((a, b) => {
      if (prioritizedId) {
        if (a.id === prioritizedId) return -1
        if (b.id === prioritizedId) return 1
      }
      return (b.popular ? 1 : 0) - (a.popular ? 1 : 0)
    })
    return { types: sorted.slice(0, 15), isDidYouMean: false }
  }

  const lower = query.toLowerCase()
  const norm = normalizeForSearch(query)
  const words = lower.split(/\s+/).filter((w) => w.length > 1)

  const scored = types.map((t) => {
    const nameLower = t.name.toLowerCase()
    const nameNorm = normalizeForSearch(t.name)
    const codeLower = t.code.toLowerCase()
    const descLower = (t.description || '').toLowerCase()
    const descNorm = normalizeForSearch(t.description || '')
    const cat =
      typeof t.category === 'string'
        ? t.category
        : ((t.category as Record<string, unknown>)?.name ??
          (t.category as Record<string, unknown>)?.title ??
          '')
    const catLower = String(cat).toLowerCase()
    const catNorm = normalizeForSearch(String(cat))

    let score = 0
    if (nameLower.startsWith(lower) || nameNorm.startsWith(norm)) score += 100
    if (nameLower.includes(lower) || nameNorm.includes(norm)) score += 50
    if (codeLower.includes(lower)) score += 40
    if (catLower.includes(lower) || catNorm.includes(norm)) score += 30
    if (descLower.includes(lower) || descNorm.includes(norm)) score += 20

    words.forEach((word) => {
      const wordNorm = normalizeForSearch(word)
      if (nameLower.includes(word) || nameNorm.includes(wordNorm)) score += 25
      if (descLower.includes(word) || descNorm.includes(wordNorm)) score += 15
    })

    if (lower.length >= 3) {
      const partialMatch = nameLower.slice(0, lower.length)
      if (partialMatch.startsWith(lower.slice(0, -1))) score += 35
      const partialNorm = nameNorm.slice(0, norm.length)
      if (partialNorm.startsWith(norm.slice(0, -1))) score += 35
    }

    return { type: t, score }
  })

  const filtered = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.type)
  const hasExactStart = types.some(
    (t) => t.name.toLowerCase().startsWith(lower) || normalizeForSearch(t.name).startsWith(norm)
  )

  return {
    types: filtered,
    isDidYouMean: !hasExactStart && filtered.length > 0 && lower.length >= 3,
  }
}

export const BusinessTypeSearchInput = React.forwardRef<
  HTMLInputElement,
  BusinessTypeSearchInputProps
>(
  (
    {
      label,
      value,
      onChange,
      size = 'md',
      className,
      disabled,
      types = businessTypes,
      naceMatchedTypeId,
      loading = false,
      loadError = null,
      onRetryLoad,
    },
    ref
  ) => {
    const t = useTranslations('forms.fields')
    const tInt = useTranslations('integrationStep')
    const tCommon = useTranslations('common.states')
    const displayLabel = label ?? t('businessType')
    const [isFocused, setIsFocused] = React.useState(false)
    const [isOpen, setIsOpen] = React.useState(false)
    const [search, setSearch] = React.useState('')
    const [focusedIndex, setFocusedIndex] = React.useState(-1)
    const [dropdownRect, setDropdownRect] = React.useState<{
      top: number
      left: number
      width: number
    } | null>(null)
    const inputRef = React.useRef<HTMLInputElement>(null)
    const containerRef = React.useRef<HTMLDivElement>(null)
    const dropdownRef = React.useRef<HTMLDivElement>(null)

    React.useImperativeHandle(ref, () => inputRef.current!)

    const selectedType = React.useMemo(() => types.find((t) => t.id === value), [value, types])

    const displayFallback = React.useMemo(() => {
      if (selectedType || !value?.trim()) return null
      if (looksLikeNaceCode(value)) return null
      return humanizeBusinessTypeSlug(value.trim())
    }, [selectedType, value])

    const { types: filteredTypes, isDidYouMean } = React.useMemo(
      () => fuzzySearchBusinessTypes(search, types, naceMatchedTypeId),
      [search, types, naceMatchedTypeId]
    )

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
      function handleClickOutside(e: MouseEvent) {
        const target = e.target as Node
        const inContainer = containerRef.current?.contains(target)
        const inDropdown = dropdownRef.current?.contains(target)
        if (!inContainer && !inDropdown) {
          setIsOpen(false)
          setSearch('')
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Focus input when opening
    React.useEffect(() => {
      if (isOpen && inputRef.current) {
        inputRef.current.focus()
      }
    }, [isOpen])

    const handleSelect = (type: BusinessType) => {
      onChange(type.id, type)
      setIsOpen(false)
      setSearch('')
      setFocusedIndex(-1)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        setSearch('')
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((prev) => Math.min(prev + 1, filteredTypes.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && focusedIndex >= 0 && filteredTypes[focusedIndex]) {
        e.preventDefault()
        handleSelect(filteredTypes[focusedIndex])
      }
    }

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation()
      onChange('')
      setSearch('')
    }

    const hasValue = Boolean(selectedType) || Boolean(displayFallback)
    const isFloated = isFocused || hasValue || isOpen
    const state = disabled ? 'disabled' : isFocused || isOpen ? 'focus' : 'default'

    const Icon = selectedType?.icon || Building2

    return (
      <div ref={containerRef} className={cn(searchContainerVariants({ size }), className)}>
        <div
          className={cn(searchGroupVariants({ state, size }), 'cursor-pointer')}
          onClick={() => !disabled && setIsOpen(true)}
        >
          {/* Emoji or Icon */}
          <div
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center',
              'w-8 h-8 rounded-lg',
              selectedType
                ? 'bg-primary/10'
                : isFocused || isOpen
                  ? 'bg-primary/5'
                  : 'bg-foreground/[0.04]'
            )}
          >
            {selectedType ? (
              <span className="text-lg" role="img" aria-label={selectedType.category}>
                {selectedType.emoji || categoryEmojis[selectedType.category] || '\u{1F3E2}'}
              </span>
            ) : (
              <Icon
                className={cn(
                  'w-4 h-4',
                  isFocused || isOpen ? 'text-primary' : 'text-foreground/50'
                )}
              />
            )}
          </div>

          {/* Display Value */}
          {!isOpen && (
            <div
              className={cn(
                searchFieldVariants({ size }),
                'flex items-center pointer-events-none',
                loading && displayFallback && 'animate-pulse'
              )}
            >
              {selectedType ? (
                <span className="truncate">{safeString(selectedType.name)}</span>
              ) : displayFallback ? (
                <span
                  className={cn('truncate', loading ? 'text-foreground/60' : 'text-foreground')}
                >
                  {displayFallback}
                </span>
              ) : (
                <span className="text-foreground/40"> </span>
              )}
            </div>
          )}

          {/* Search Input (visible when open) */}
          {isOpen && (
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder=" "
              className={cn(searchFieldVariants({ size }))}
            />
          )}

          {/* Floating Label */}
          <label className={cn(floatingLabelVariants({ state, floated: isFloated, size }))}>
            {displayLabel}
          </label>

          {/* Right Side */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5">
            {selectedType && (
              <>
                <span className="text-[10px] font-mono text-foreground/40 bg-foreground/[0.04] px-1.5 py-0.5 rounded">
                  {selectedType.code}
                </span>
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1 rounded-full text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            )}
            {displayFallback && !selectedType && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 rounded-full text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5 transition-colors"
                aria-label="Clear"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <ChevronDown
              className={cn(
                'w-4 h-4 text-foreground/40 transition-transform',
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
              ref={dropdownRef}
              variants={dropdownVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onMouseDown={(e) => e.preventDefault()}
              role="listbox"
              aria-label={label}
              aria-activedescendant={
                focusedIndex >= 0 && filteredTypes[focusedIndex]
                  ? `biztype-option-${filteredTypes[focusedIndex].id}`
                  : undefined
              }
              className={cn(
                'fixed z-[9999]',
                'bg-background border border-foreground/[0.10] rounded-xl shadow-xl',
                'overflow-hidden max-h-80 overflow-y-auto'
              )}
              style={{
                top: dropdownRect.top,
                left: dropdownRect.left,
                width: dropdownRect.width,
              }}
            >
              {isDidYouMean && (
                <div className="px-3 py-2 border-b border-foreground/[0.06] bg-foreground/[0.02]">
                  <span className="text-xs font-medium text-foreground/50">
                    {tInt('didYouMean')}
                  </span>
                </div>
              )}

              {loadError && filteredTypes.length === 0 ? (
                <div className="px-4 py-4 text-sm">
                  <p className="text-destructive/80 mb-1">{tCommon('loadFailed')}</p>
                  <p className="text-foreground/40 text-xs mb-3">{loadError}</p>
                  {onRetryLoad && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRetryLoad()
                      }}
                      className="text-xs font-medium text-primary hover:text-primary/80"
                    >
                      {tInt('tryAgain')}
                    </button>
                  )}
                </div>
              ) : filteredTypes.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-foreground/50">
                  {tInt('noBusinessTypesFound')}
                </div>
              ) : (
                filteredTypes.slice(0, 10).map((type, index) => {
                  const TypeIcon = type.icon
                  return (
                    <button
                      key={type.id}
                      id={`biztype-option-${type.id}`}
                      type="button"
                      ref={
                        index === focusedIndex
                          ? (el) => el?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
                          : undefined
                      }
                      onClick={() => handleSelect(type)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                        'hover:bg-foreground/[0.04]',
                        focusedIndex === index && 'bg-foreground/[0.06]',
                        index !== Math.min(filteredTypes.length, 10) - 1 &&
                          'border-b border-foreground/[0.04]'
                      )}
                      role="option"
                      aria-selected={focusedIndex === index}
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-base" role="img" aria-label={type.category}>
                          {type.emoji || categoryEmojis[type.category] || '\u{1F3E2}'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {safeString(type.name)}
                          </span>
                          <span className="text-[10px] font-mono text-foreground/40 bg-foreground/[0.04] px-1.5 py-0.5 rounded shrink-0">
                            {safeString(type.code)}
                          </span>
                        </div>
                        {safeString(type.description) && (
                          <p className="text-[11px] text-foreground/40 truncate">
                            {safeString(type.description)}
                          </p>
                        )}
                      </div>
                      {value === type.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                    </button>
                  )
                })
              )}
            </motion.div>,
            document.body
          )}
      </div>
    )
  }
)
BusinessTypeSearchInput.displayName = 'BusinessTypeSearchInput'

// Export all types and components
export { categoryIcons, categoryLabels, categoryEmojis, businessTypes as defaultBusinessTypes }
