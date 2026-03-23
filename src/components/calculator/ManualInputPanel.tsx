'use client'

/**
 * Manual Input Panel
 *
 * Clean, minimal form for bedrijfsschatting data entry.
 * World-class design: progressive disclosure, single primary CTA.
 *
 * KEY FEATURE: Multi-year EBITDA Normalization
 * - Normalizations apply to historical years (3-5 years)
 * - Calculate normalized average EBITDA for valuation
 * - Each year can have its own set of adjustments
 */

import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  ArrowDown,
  Building2,
  Check,
  CloudDownload,
  FileSpreadsheet,
  HelpCircle,
  Loader2,
  Plus,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type BusinessType,
  BusinessTypeSearchInput,
  categoryIcons,
  type KBOCompany,
  KBOSearchInput,
} from '@/design-system'
import { AuroraButton } from '@/design-system/components/Button'
import { AuroraInput } from '@/design-system/components/Input'
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/design-system/components/Modal'
import { AuroraSelect } from '@/design-system/components/Select'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/design-system/components/Tooltip'
import { cn } from '@/design-system/utils'
import { useBusinessTypes } from '../../hooks/useBusinessTypes'
import { useCanSave } from '../../hooks/useCanSave'
import { looksLikeNaceCode, naceBusinessTypeService } from '../../services/naceBusinessTypeService'
import { registryService } from '../../services/registry/registryService'
import type { CompanySearchResult } from '../../services/registry/types'
import {
  accountingAPI,
  accountingProviderDisplayName,
  isAccountingImportProvider,
  parseAccountingApiError,
  pickConnectedImportStatus,
  type AccountingImportProvider,
  type IntegrationStatus,
} from '../../services/api/accounting'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useManualResultsStore } from '../../store/manual/useManualResultsStore'
import { getLastFullFiscalYear } from '../../utils/fiscalYear'
import { mapLegalFormToBusinessStructure } from '../../utils/legalFormMapping'
import { useNormalizationStore } from '../../store/useNormalizationStore'
import { useTaxLatencyStore } from '../../store/useTaxLatencyStore'
import { CSVUploadCard, type ParsedCSVData } from '@/components/integrations/CSVUploadCard'
import { CurrencyInput } from './CurrencyInput'
import { ProvenanceDot } from './ProvenanceDot'
import { GuidedResolutionOrphanFields } from './GuidedResolutionOrphanFields'
import { SpotlightBanner } from './SpotlightBanner'
import { SpotlightFieldWrapper } from './SpotlightFieldWrapper'
import {
  formatShareholdingInput,
  hasAtMostTwoShareholdingDecimals,
  isValidShareholdingValue,
  isShareholdingValueInRange,
  parseShareholdingInput,
} from '../../utils/shareholding'

// Types
export interface YearlyFinancials {
  year: string
  revenue: number
  ebitda: number
  normalizedEbitda?: number
}

export interface ValuationFormData {
  companyName: string
  kboNumber?: string
  legalForm?: string
  address?: string
  naceCode?: string
  naceDescription?: string
  businessType: string
  businessTypeCode?: string
  industry: string
  country: string
  yearFounded: string
  businessStructure: string
  equityStake: number
  ownerManagers: number
  fteEmployees: number | undefined
  // Multi-year financials with normalizations per year
  yearlyFinancials: YearlyFinancials[]
  // Calculated values
  averageNormalizedEbitda?: number
  // Convenience fields for AI context (derived from yearlyFinancials[0])
  revenue?: number
  ebitda?: number
  current_year_data?: { year: number; revenue: number; ebitda: number }
}

// Field help context for AI assistant integration
export interface FieldHelpContext {
  field: string
  label: string
  value?: number | string
  grootboekCode?: string
  category?: string
  hint?: string
  normalizationType?: 'salary' | 'rent' | 'vehicle' | 'one-time' | 'personal' | 'other'
}

// Quick action for top normalisations
export interface QuickNormalizationAction {
  id: string
  code: string
  description: string
  category: 'salary' | 'rent' | 'vehicle' | 'one-time' | 'personal' | 'depreciation' | 'other'
  amount: number
  reason: string
  sourceRef?: string
  status: 'pending' | 'accepted' | 'rejected'
}

interface ManualInputPanelProps {
  onSubmit: (data: ValuationFormData) => void
  onCSVImportComplete?: (
    source: 'yuki' | 'exact' | 'odoo' | 'octopus' | 'accountable',
    fileName?: string
  ) => void
  isCalculating?: boolean
  initialData?: Partial<ValuationFormData>
  onFieldHelpRequest?: (context: FieldHelpContext) => void
  quickActions?: QuickNormalizationAction[]
  onQuickActionAccept?: (id: string) => void
  onQuickActionReject?: (id: string) => void
  onViewAllNormalizations?: () => void
  /** Called when form data changes (debounced 300ms). Enables AI assistant to access financials before submit. */
  onFormDataChange?: (data: Record<string, unknown>) => void
  /** Optional ref to sync form financials synchronously during render. Used by sibling modals that need latest data without effect delay. */
  formDataRef?: React.MutableRefObject<Record<string, unknown> | null>
  /** When true, valuation is complete (report exists) — progress header is hidden. */
  hasReport?: boolean
  /** STP: When true, KBO fields are pre-filled from backend enrichment and shown as read-only */
  readOnlyKbo?: boolean
  /** STP: When true, auto-advance past steps that are fully pre-filled */
  autoAdvancePastPrefilledSteps?: boolean
}

// Options
const businessStructures = [
  { value: 'bv', label: 'BV' },
  { value: 'nv', label: 'NV' },
  { value: 'eenmanszaak', label: 'Eenmanszaak' },
  { value: 'vof', label: 'VOF' },
  { value: 'cvba', label: 'CVBA' },
  { value: 'vzw', label: 'VZW' },
]

// Inline FieldHelpTrigger component for contextual AI assistance
function FieldHelpTrigger({
  context,
  onTrigger,
  className,
}: {
  context: FieldHelpContext
  onTrigger?: (context: FieldHelpContext) => void
  className?: string
}) {
  const mi = useTranslations('manualInput')
  if (!onTrigger) return null

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onTrigger(context)
  }

  return (
    <TooltipProvider delayDuration={300}>
      <TooltipRoot>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            className={cn(
              'inline-flex items-center justify-center rounded-md transition-all',
              'text-foreground/30 hover:text-primary hover:bg-primary/10',
              'focus:outline-none focus:ring-2 focus:ring-primary/20',
              'w-5 h-5',
              className
            )}
            aria-label={mi('askAi', { label: context.label })}
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px] text-xs">
          <p>{mi('askAiAbout', { label: context.label.toLowerCase() })}</p>
          {context.grootboekCode && (
            <p className="text-foreground/50 mt-0.5 font-mono text-[10px]">
              {mi('ledger')}: {context.grootboekCode}
            </p>
          )}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}

const currentYear = getLastFullFiscalYear() + 1

// Generate default yearly financials for last 3 years
const generateDefaultYearlyFinancials = (): YearlyFinancials[] => {
  return [
    { year: String(currentYear - 1), revenue: 0, ebitda: 0 },
    { year: String(currentYear - 2), revenue: 0, ebitda: 0 },
    { year: String(currentYear - 3), revenue: 0, ebitda: 0 },
  ]
}

export function ManualInputPanel({
  onSubmit,
  onCSVImportComplete,
  isCalculating = false,
  initialData = {},
  onFieldHelpRequest,
  quickActions = [],
  onQuickActionAccept,
  onQuickActionReject,
  onViewAllNormalizations,
  onFormDataChange,
  formDataRef,
  hasReport = false,
  readOnlyKbo = false,
  autoAdvancePastPrefilledSteps = false,
}: ManualInputPanelProps) {
  const t = useTranslations()
  const mi = useTranslations('manualInput')
  const tTax = useTranslations('taxLatency')
  const tKbo = useTranslations('forms.kboLookup')
  const locale = useLocale()
  const currencyLocale = locale === 'en' ? 'en-BE' : 'nl-BE'
  const taxLatencyCount = useTaxLatencyStore((s) => s.items.length)
  const normalizationItems = useNormalizationStore((s) => s.items)
  const hasExplicitNumericValue = useCallback(
    (value: unknown) =>
      value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value)),
    []
  )
  const acceptedNormCount = normalizationItems.filter((n) => n.status === 'accepted').length
  const formatCurrency = useCallback(
    (amount: number) => {
      const safe = Number.isFinite(amount) ? amount : 0
      return new Intl.NumberFormat(currencyLocale, {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(safe)
    },
    [currencyLocale]
  )
  const [formData, setFormData] = useState<ValuationFormData>({
    companyName: initialData.companyName || '',
    kboNumber: initialData.kboNumber || '',
    legalForm: initialData.legalForm || '',
    address: initialData.address || '',
    naceCode: initialData.naceCode || '',
    naceDescription: initialData.naceDescription || '',
    businessType: initialData.businessType || '',
    businessTypeCode: initialData.businessTypeCode || '',
    industry: initialData.industry || '',
    country: initialData.country || 'BE',
    yearFounded: initialData.yearFounded || '',
    businessStructure: initialData.businessStructure || '',
    equityStake: initialData.equityStake ?? 100,
    ownerManagers: initialData.ownerManagers || 1,
    fteEmployees: initialData.fteEmployees ?? 5,
    yearlyFinancials: initialData.yearlyFinancials || generateDefaultYearlyFinancials(),
  })
  const [isEditingEquityStake, setIsEditingEquityStake] = useState(false)
  const [equityStakeInput, setEquityStakeInput] = useState(() =>
    formatShareholdingInput(initialData.equityStake ?? 100)
  )
  const lastValidEquityStakeRef = useRef(
    isValidShareholdingValue(initialData.equityStake ?? 100) ? (initialData.equityStake ?? 100) : 100
  )

  useEffect(() => {
    if (!isEditingEquityStake) {
      setEquityStakeInput(formatShareholdingInput(formData.equityStake))
    }
  }, [formData.equityStake, isEditingEquityStake])

  useEffect(() => {
    if (isValidShareholdingValue(formData.equityStake)) {
      lastValidEquityStakeRef.current = formData.equityStake
    }
  }, [formData.equityStake])

  // Sync form financials to ref during render for sibling components (e.g. normalization modal)
  // that need latest data without effect delay — eliminates race when opening modal immediately
  if (formDataRef && formDataRef.current != null) {
    const current = formData.yearlyFinancials?.[0]
    Object.assign(formDataRef.current, {
      yearlyFinancials: formData.yearlyFinancials,
      current_year_data: current
        ? { year: parseInt(current.year, 10), revenue: current.revenue, ebitda: current.ebitda }
        : undefined,
      ebitda: current?.ebitda,
    })
  }

  // KBO verification state
  const [selectedCompany, setSelectedCompany] = useState<KBOCompany | null>(null)
  const [companySearchValue, setCompanySearchValue] = useState(formData.companyName || '')
  const updateFormData = useManualFormStore((s) => s.updateFormData)

  // Sync prefill from bootstrap/session when initialData arrives after mount
  // Dependencies on key fields ensure we re-run when prefill arrives late (e.g. async store hydration)
  const prefillAbortRef = useRef<boolean>(false)
  useEffect(() => {
    const prefill = initialData
    if (!prefill || typeof prefill !== 'object') return

    prefillAbortRef.current = false
    const isCurrent = () => !prefillAbortRef.current

    // Apply only when field is empty - never overwrite user-entered data
    const applyPrefill = (
      prev: ValuationFormData,
      updates: Record<string, unknown>,
      key: keyof ValuationFormData,
      value: string | number | undefined
    ) => {
      if (value === undefined || value === null) return
      if (typeof value === 'string' && value === '') return
      const current = prev[key]
      const isEmpty =
        current === undefined ||
        current === null ||
        (typeof current === 'string' && current === '') ||
        (typeof current === 'number' && key === 'ownerManagers' && current === 1) ||
        (typeof current === 'number' && key === 'equityStake' && current === 100) ||
        // fteEmployees: apply when empty, or when default 5 and prefill has different value (e.g. 0 from restore)
        (key === 'fteEmployees' &&
          (current === undefined ||
            (typeof current === 'number' && current === 5 && value !== 5)))
      if (isEmpty) (updates as Record<string, unknown>)[key] = value
    }

    const businessStructure = mapLegalFormToBusinessStructure(prefill.legalForm)

    const runPrefill = async () => {
      let businessTypeToApply = prefill.businessType
      let industryToApply = prefill.industry
      if (businessTypeToApply && looksLikeNaceCode(businessTypeToApply)) {
        const resolved = await naceBusinessTypeService.getBusinessTypeForNaceCode(
          businessTypeToApply.trim()
        )
        if (!isCurrent()) return
        if (resolved?.id) {
          businessTypeToApply = resolved.id
          industryToApply = resolved.category || prefill.industry
          updateFormData({ business_type_id: resolved.id, industry: industryToApply })
        } else {
          businessTypeToApply = ''
        }
      }
      if (businessTypeToApply && looksLikeNaceCode(businessTypeToApply)) {
        businessTypeToApply = ''
      }

      if (!isCurrent()) return
      let companyNameUpdate: string | undefined
      setFormData((prev) => {
        const updates: Record<string, unknown> = {}
        applyPrefill(prev, updates, 'companyName', prefill.companyName)
        applyPrefill(prev, updates, 'kboNumber', prefill.kboNumber)
        applyPrefill(prev, updates, 'legalForm', prefill.legalForm)
        applyPrefill(
          prev,
          updates,
          'businessStructure',
          prefill.businessStructure || businessStructure
        )
        applyPrefill(prev, updates, 'address', prefill.address)
        applyPrefill(prev, updates, 'naceCode', prefill.naceCode)
        applyPrefill(prev, updates, 'naceDescription', prefill.naceDescription)
        applyPrefill(prev, updates, 'businessType', businessTypeToApply || undefined)
        applyPrefill(prev, updates, 'businessTypeCode', prefill.businessTypeCode)
        applyPrefill(prev, updates, 'industry', industryToApply)
        applyPrefill(prev, updates, 'country', prefill.country)
        applyPrefill(prev, updates, 'yearFounded', prefill.yearFounded)
        applyPrefill(prev, updates, 'ownerManagers', prefill.ownerManagers)
        applyPrefill(prev, updates, 'fteEmployees', prefill.fteEmployees)
        applyPrefill(prev, updates, 'equityStake', prefill.equityStake)
        if (
          prefill.yearlyFinancials?.length &&
          prefill.yearlyFinancials.some((yf: any) => yf.revenue > 0 || yf.ebitda !== 0)
        ) {
          const currentIsDefault = prev.yearlyFinancials.every(
            (yf) => yf.revenue === 0 && yf.ebitda === 0
          )
          if (currentIsDefault) {
            ;(updates as Record<string, unknown>).yearlyFinancials = prefill.yearlyFinancials
          }
        }
        if (updates.companyName) companyNameUpdate = String(updates.companyName)
        if (Object.keys(updates).length === 0) return prev
        return { ...prev, ...updates }
      })
      if (companyNameUpdate) setCompanySearchValue(companyNameUpdate)
      const hasExpandData =
        prefill.kboNumber || prefill.legalForm || businessTypeToApply || prefill.industry
      if (companyNameUpdate && hasExpandData) {
        setSelectedCompany({
          id: prefill.kboNumber || 'prefill',
          name: companyNameUpdate,
          kboNumber: prefill.kboNumber || '',
          legalForm: prefill.legalForm || '',
          address: prefill.address || '',
          postalCode: '',
          city: '',
          naceCode: prefill.naceCode,
          naceDescription: prefill.naceDescription,
        })
      }
    }
    runPrefill()
    return () => {
      prefillAbortRef.current = true
    }
  }, [
    initialData?.companyName,
    initialData?.kboNumber,
    initialData?.legalForm,
    initialData?.businessStructure,
    initialData?.address,
    initialData?.naceCode,
    initialData?.naceDescription,
    initialData?.businessType,
    initialData?.industry,
    initialData?.country,
    initialData?.yearFounded,
    initialData?.ownerManagers,
    initialData?.fteEmployees,
    initialData?.equityStake,
    initialData?.yearlyFinancials,
    updateFormData,
  ])

  // STP: Auto-advance past pre-filled steps by scrolling to first incomplete section
  const financialsStepRef = useRef<HTMLElement>(null)
  const normalizationsStepRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!autoAdvancePastPrefilledSteps) return
    const hasPrefilledCompany = !!formData.companyName && !!formData.businessType
    const hasPrefilledFinancials = formData.yearlyFinancials.some(
      (yf) => yf.revenue > 0 || yf.ebitda !== 0
    )

    const timer = setTimeout(() => {
      if (hasPrefilledCompany && hasPrefilledFinancials && normalizationsStepRef.current) {
        normalizationsStepRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (hasPrefilledCompany && financialsStepRef.current) {
        financialsStepRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [autoAdvancePastPrefilledSteps, formData.companyName, formData.businessType, formData.yearlyFinancials])

  // Sync form data to parent for AI context and normalization modal originalEBITDA
  // Immediate sync on mount/deps change (avoids 300ms race when opening modal quickly)
  // Debounced 300ms prevents spamming on rapid edits
  const onFormDataChangeRef = useRef(onFormDataChange)
  onFormDataChangeRef.current = onFormDataChange
  const syncFormData = useCallback(() => {
    if (!onFormDataChangeRef.current) return
    const current = formData.yearlyFinancials?.[0]
    onFormDataChangeRef.current({
      companyName: formData.companyName,
      industry: formData.industry,
      country: formData.country,
      yearFounded: formData.yearFounded,
      ownerManagers: formData.ownerManagers,
      fteEmployees: formData.fteEmployees,
      equityStake: formData.equityStake,
      businessType: formData.businessType,
      revenue: current?.revenue,
      ebitda: current?.ebitda,
      yearlyFinancials: formData.yearlyFinancials,
      current_year_data: current
        ? { year: parseInt(current.year, 10), revenue: current.revenue, ebitda: current.ebitda }
        : undefined,
    })
  }, [formData.companyName, formData.industry, formData.country, formData.yearFounded, formData.ownerManagers, formData.fteEmployees, formData.equityStake, formData.businessType, formData.yearlyFinancials])
  useEffect(() => {
    syncFormData()
    const t = setTimeout(syncFormData, 300)
    return () => clearTimeout(t)
  }, [syncFormData])

  // Ensure companySearchValue is synced when initialData.companyName arrives late (e.g. after async store hydration)
  // Only updates when companySearchValue is empty to avoid overwriting user input
  useEffect(() => {
    const name = initialData?.companyName?.trim()
    if (name) {
      setCompanySearchValue((prev) => (prev?.trim() ? prev : name))
    }
  }, [initialData?.companyName])

  // Fallback: set selectedCompany when we have companyName + KBO data but selectedCompany is still null
  // Handles case where first prefill effect's companyNameUpdate was not set (e.g. formData already had companyName)
  useEffect(() => {
    const name = initialData?.companyName?.trim()
    const hasExpandData =
      initialData?.kboNumber ||
      initialData?.legalForm ||
      initialData?.businessType ||
      initialData?.industry
    if (!name || !hasExpandData) return

    setSelectedCompany((prev) => {
      if (prev) return prev
      return {
        id: initialData?.kboNumber || 'prefill',
        name,
        kboNumber: initialData?.kboNumber || '',
        legalForm: initialData?.legalForm || '',
        address: initialData?.address || '',
        postalCode: '',
        city: '',
        naceCode: initialData?.naceCode,
        naceDescription: initialData?.naceDescription,
      }
    })
  }, [
    initialData?.companyName,
    initialData?.kboNumber,
    initialData?.legalForm,
    initialData?.businessType,
    initialData?.industry,
  ])

  // Business type state
  const [selectedBusinessType, setSelectedBusinessType] = useState<BusinessType | null>(null)

  // Section collapse states
  const [showCSVUpload, setShowCSVUpload] = useState(false)

  // Calculate normalized EBITDA per year and average using global normalization store
  const normalizedData = useMemo(() => {
    const acceptedItems = normalizationItems.filter((n) => n.status === 'accepted')

    const years = formData.yearlyFinancials.map((yf) => {
      const yearNum = Number(yf.year)
      const yearNorms = acceptedItems.filter((n) => {
        if (n.applyAllYears) return true
        if (n.applyYears && n.applyYears.length > 0) return n.applyYears.includes(yearNum)
        return n.year === yearNum
      })
      const rawEbitda = Number(yf.ebitda)
      const yearEbitda = Number.isFinite(rawEbitda) ? rawEbitda : 0
      const totalAdjustment = yearNorms.reduce((sum, n) => {
        const rawVal = Number(n.value)
        const val = Number.isFinite(rawVal) ? rawVal : 0
        const rawAdj = Number(n.adjustment)
        const adj = Number.isFinite(rawAdj) ? rawAdj : 0
        if (
          yearEbitda === 0 &&
          (n.type === 'add_percent' || n.type === 'subtract_percent' || n.type === 'absolute')
        ) {
          return sum + adj
        }
        if (n.type === 'add_percent') return sum + (yearEbitda * val) / 100
        if (n.type === 'subtract_percent') return sum - (yearEbitda * val) / 100
        if (n.type === 'absolute') return sum + (val - yearEbitda)
        return sum + adj
      }, 0)
      const safeTotalAdj = Number.isFinite(totalAdjustment) ? totalAdjustment : 0
      const normalizedEbitda = yearEbitda + safeTotalAdj
      return {
        ...yf,
        normalizedEbitda,
        totalAdjustment: safeTotalAdj,
        normalizationCount: yearNorms.length,
      }
    })

    // Weighted average: most recent years weighted higher (McKinsey method).
    // Include break-even and loss-making years, but ignore incomplete empty rows.
    const validYears = years
      .filter((y) => y.year != null && Number(y.year) >= 2000 && Number(y.year) <= 2100)
      .sort((a, b) => Number(a.year) - Number(b.year))
    const yearsWithEbitda = validYears.filter(
      (y) => (Number(y.revenue) || 0) > 0 && hasExplicitNumericValue(y.ebitda)
    )
    let weightedSum = 0
    let totalWeight = 0
    yearsWithEbitda.forEach((y, index) => {
      const weight = index + 1 // Ascending: oldest=1, most recent=highest
      const norm = Number.isFinite(y.normalizedEbitda) ? y.normalizedEbitda : 0
      weightedSum += norm * weight
      totalWeight += weight
    })

    const averageNormalizedEbitda = totalWeight > 0 ? weightedSum / totalWeight : 0

    return {
      years,
      averageNormalizedEbitda,
      totalYearsWithData: yearsWithEbitda.length,
    }
  }, [formData.yearlyFinancials, hasExplicitNumericValue, normalizationItems])

  const searchCountry = formData.country || 'BE'

  // Registry search: routes to KBO (BE) or KVK (NL) based on form country
  const kboSearchFn = useCallback(
    async (query: string, signal?: AbortSignal): Promise<KBOCompany[]> => {
      if (!query || query.trim().length < 2) return []
      const response = await registryService.searchCompanies(query.trim(), searchCountry, 15, signal)
      if (!response.success) {
        throw new Error(response.error || tKbo('searchUnavailable'))
      }
      if (!response.results) return []
      return response.results.map((r: CompanySearchResult, index: number) => ({
        id:
          r.company_id ||
          (r.kbo_number || r.registration_number || `kbo-${index}`).replace(/[.\s]/g, ''),
        name: r.company_name,
        kboNumber: r.kbo_number || r.registration_number,
        legalForm: r.legal_form,
        address: [r.address, r.postal_code, r.city].filter(Boolean).join(', '),
        postalCode: r.postal_code || '',
        city: r.city || '',
        naceCode: r.nace_code || '',
        naceDescription: r.nace_description || '',
      }))
    },
    [tKbo, searchCountry]
  )

  // Business types from Titan API (instead of hardcoded)
  const {
    businessTypes,
    loading: businessTypesLoading,
    error: businessTypesError,
    refetch: refetchBusinessTypes,
  } = useBusinessTypes()
  const businessTypesForSearch = useMemo((): BusinessType[] => {
    const apiCategoryToIconKey: Record<string, string> = {
      restaurant: 'food',
      restaurants: 'food',
      horeca: 'hospitality',
      catering: 'food',
      professional: 'consulting',
      professionals: 'consulting',
    }
    return businessTypes.map((bt) => {
      const cat =
        typeof bt.category === 'string'
          ? bt.category
          : ((bt.category as Record<string, unknown>)?.name ??
            (bt.category as Record<string, unknown>)?.title ??
            'other')
      const rawCategory = String(cat).toLowerCase().replace(/\s+/g, '-')
      const iconKey = apiCategoryToIconKey[rawCategory] ?? rawCategory
      const category = categoryIcons[iconKey] ? iconKey : 'other'
      return {
        id: bt.id,
        code: bt.industryMapping || bt.id,
        name: bt.title,
        category,
        icon: categoryIcons[iconKey] ?? categoryIcons['other'] ?? Building2,
        emoji: bt.icon || '🏢',
        popular: bt.popular ?? false,
      }
    })
  }, [businessTypes])

  // Auto-fill business type from NACE when we have naceCode but no businessType (mirror Mercury AddClient)
  const naceAbortRef = useRef<AbortController | null>(null)
  const companySelectAbortRef = useRef<AbortController | null>(null)
  const [nacePrefillError, setNacePrefillError] = useState<string | null>(null)
  const [naceRetryTrigger, setNaceRetryTrigger] = useState(0)

  // Cleanup all NACE-related abort controllers on unmount
  useEffect(() => {
    return () => {
      naceAbortRef.current?.abort()
      companySelectAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    const naceCode = formData.naceCode?.trim() || selectedCompany?.naceCode?.trim()
    if (!naceCode || formData.businessType?.trim()) {
      setNacePrefillError(null)
      return
    }

    // Skip if handleCompanySelect is already doing its own NACE fetch
    if (companySelectAbortRef.current && !companySelectAbortRef.current.signal.aborted) return

    if (naceAbortRef.current) naceAbortRef.current.abort()
    const controller = new AbortController()
    naceAbortRef.current = controller
    setNacePrefillError(null)

    naceBusinessTypeService
      .getBusinessTypeForNaceCode(naceCode, controller.signal)
      .then((type) => {
        if (controller.signal.aborted) return
        if (type) {
          // Only apply if user hasn't manually selected a type while we were fetching
          setSelectedBusinessType((prev) => prev ?? type)
          setFormData((prev) => {
            if (prev.businessType?.trim()) return prev
            return {
              ...prev,
              businessType: type.id,
              businessTypeCode: type.code || prev.businessTypeCode,
              industry: type.category || prev.industry,
            }
          })
          setNacePrefillError(null)
        } else {
          setNacePrefillError(t('errors.noBusinessTypeForNace'))
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          const msg =
            err instanceof Error && err.message === 'BUSINESS_TYPE_FETCH_FAILED'
              ? t('errors.businessTypeFetchFailed')
              : err instanceof Error
                ? err.message
                : t('errors.businessTypeFetchFailed')
          setNacePrefillError(msg)
        }
      })
      .finally(() => {
        if (naceAbortRef.current === controller) naceAbortRef.current = null
      })

    return () => controller.abort()
  }, [formData.naceCode, formData.businessType, selectedCompany?.naceCode, naceRetryTrigger])

  // Sync selectedBusinessType when formData.businessType is set from prefill/bootstrap (DB or KBO)
  useEffect(() => {
    const btId = formData.businessType?.trim()
    if (!btId || selectedBusinessType?.id === btId) return
    const match = businessTypesForSearch.find((t) => t.id === btId)
    if (match) setSelectedBusinessType(match)
  }, [formData.businessType, businessTypesForSearch, selectedBusinessType?.id])

  const updateField = <K extends keyof ValuationFormData>(
    field: K,
    value: ValuationFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const updateYearlyFinancials = (year: string, field: 'revenue' | 'ebitda', value: number) => {
    const updated = formData.yearlyFinancials.map((yf) =>
      yf.year === year ? { ...yf, [field]: value } : yf
    )
    updateField('yearlyFinancials', updated)
  }

  // Accounting import — silent preflight; button only appears when a provider is connected
  const [accountingConnectedStatus, setAccountingConnectedStatus] =
    useState<IntegrationStatus | null>(null)
  const [importingFromAccounting, setImportingFromAccounting] = useState(false)
  const [importAccountingError, setImportAccountingError] = useState<string | null>(null)
  const accountingRefetchThrottle = useRef(0)

  const loadAccountingIntegrationStatus = useCallback(async () => {
    try {
      const statuses = await accountingAPI.getAllIntegrationStatus()
      setAccountingConnectedStatus(pickConnectedImportStatus(statuses))
    } catch {
      // Fail silently — if we can't reach Titan the import button simply won't appear
    }
  }, [])

  useEffect(() => {
    void loadAccountingIntegrationStatus()
  }, [loadAccountingIntegrationStatus])

  /** After connecting in Mercury (new tab), refresh status when user returns. */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - accountingRefetchThrottle.current < 2500) return
      accountingRefetchThrottle.current = now
      void loadAccountingIntegrationStatus()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [loadAccountingIntegrationStatus])

  const handleImportFromAccounting = useCallback(async () => {
    setImportAccountingError(null)
    setImportingFromAccounting(true)
    try {
      let row = accountingConnectedStatus
      if (!row?.is_connected) {
        const statuses = await accountingAPI.getAllIntegrationStatus()
        row = pickConnectedImportStatus(statuses) ?? null
        setAccountingConnectedStatus(row)
      }
      const provider = row && isAccountingImportProvider(row.provider) ? row.provider : null
      if (!provider) {
        const hint =
          mi('accountingNotConnectedHint') ||
          'Connect Yuki or Exact Online in accountant settings to import.'
        setImportAccountingError(hint)
        import('sonner').then(({ toast }) =>
          toast.error(mi('importFromAccountingError') || 'Import failed', { description: hint })
        )
        return
      }

      const fiscalYear = getLastFullFiscalYear()
      const res = await accountingAPI.getProviderFinancialData(provider, fiscalYear)
      const d = res.data
      const year = String(d.fiscal_year ?? new Date().getFullYear())
      const revenue = Number(d.revenue) || 0
      const ebitda = d.ebitda != null ? Number(d.ebitda) : 0

      setFormData((prev) => {
        const existing = prev.yearlyFinancials.find((yf) => yf.year === year)
        let updated: typeof prev.yearlyFinancials
        if (existing) {
          updated = prev.yearlyFinancials.map((yf) =>
            yf.year === year ? { ...yf, revenue, ebitda } : yf
          )
        } else {
          updated = [{ year, revenue, ebitda }, ...prev.yearlyFinancials]
        }
        return { ...prev, yearlyFinancials: updated }
      })
      const label = accountingProviderDisplayName(provider)
      import('sonner').then(({ toast }) => {
        const fyDescription =
          mi('importFromAccountingSuccessDescription', { year }) || `Fiscal year ${year}`
        if (revenue === 0 && ebitda === 0) {
          toast.warning(
            mi('importFromAccountingEmpty', { provider: label, year }) ||
              `No figures returned for ${year} from ${label}`,
            {
              description:
                mi('importFromAccountingEmptyDescription') ||
                'Revenue and EBITDA are zero. Check the fiscal year in your accounting tool or enter values manually.',
            }
          )
        } else {
          toast.success(
            mi('importFromAccountingSuccess', { provider: label }) ||
              `Financial data imported from ${label}`,
            { description: fyDescription }
          )
        }
      })
    } catch (err) {
      const msg = parseAccountingApiError(err)
      setImportAccountingError(msg)
      import('sonner').then(({ toast }) =>
        toast.error(mi('importFromAccountingError') || 'Import failed', { description: msg })
      )
    } finally {
      setImportingFromAccounting(false)
    }
  }, [accountingConnectedStatus, mi])


  // ─── Field-level Validation ───
  const fieldValidation = useMemo(() => {
    const warnings: Record<string, string> = {}
    const errors: Record<string, string> = {}
    const currentYear = new Date().getFullYear()

    // Validate yearly financials
    for (const yf of formData.yearlyFinancials) {
      if (yf.revenue > 0 && yf.revenue > 1_000_000_000) {
        warnings[`revenue-${yf.year}`] = mi('validation.revenueOver1B')
      }
      if (yf.ebitda !== 0) {
        if (yf.ebitda < -100_000_000) errors[`ebitda-${yf.year}`] = mi('validation.ebitdaBelow100M')
        else if (yf.ebitda > 500_000_000)
          errors[`ebitda-${yf.year}`] = mi('validation.ebitdaAbove500M')
        if (yf.revenue > 0) {
          const margin = (yf.ebitda / yf.revenue) * 100
          if (margin < -50)
            warnings[`margin-${yf.year}`] = mi('validation.marginLow', {
              margin: margin.toFixed(0),
            })
          else if (margin > 80)
            warnings[`margin-${yf.year}`] = mi('validation.marginHigh', {
              margin: margin.toFixed(0),
            })
        }
      }
    }

    // Owner managers
    if (formData.ownerManagers < 0) errors.ownerManagers = mi('validation.minZero')
    // FTE Employees (0 is valid for owner-only; required when owner count > 0)
    if (formData.ownerManagers > 0 && formData.fteEmployees === undefined) {
      errors.fteEmployees = mi('validation.fteRequired')
    } else if (formData.fteEmployees !== undefined) {
      if (formData.fteEmployees < 0) errors.fteEmployees = mi('validation.minZero')
      else if (formData.fteEmployees > 10000) warnings.fteEmployees = mi('validation.fteOver10k')
    }
    // Equity stake (reject NaN/Infinity)
    if (
      !Number.isFinite(formData.equityStake) ||
      formData.equityStake < 0 ||
      formData.equityStake > 100 ||
      !hasAtMostTwoShareholdingDecimals(formData.equityStake)
    )
      errors.equityStake = mi('validation.equityRange')
    // Year founded
    if (
      formData.yearFounded &&
      (Number(formData.yearFounded) < 1800 || Number(formData.yearFounded) > currentYear)
    ) {
      errors.yearFounded = mi('validation.yearRange', { year: currentYear })
    }

    return { warnings, errors, hasErrors: Object.keys(errors).length > 0 }
  }, [formData])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (fieldValidation.hasErrors) {
      import('sonner').then(({ toast }) =>
        toast.error(mi('validation.checkFields'), {
          description: Object.values(fieldValidation.errors)[0],
        })
      )
      return
    }
    onSubmit({
      ...formData,
      averageNormalizedEbitda: normalizedData.averageNormalizedEbitda,
    })
  }

  // Handle KBO company selection (Mercury parity: prefill business type from NACE)
  const handleCompanySelect = useCallback(
    async (company: KBOCompany) => {
      // Cancel any in-flight NACE lookups (from useEffect or previous company select)
      if (naceAbortRef.current) naceAbortRef.current.abort()
      if (companySelectAbortRef.current) companySelectAbortRef.current.abort()
      const controller = new AbortController()
      companySelectAbortRef.current = controller

      setSelectedCompany(company)
      setCompanySearchValue(company.name ?? '')

      const addr = company.address ?? ''
      const postal = company.postalCode ?? ''
      const city = company.city ?? ''
      const addressStr =
        postal && addr && !addr.includes(postal) ? `${addr}, ${postal} ${city}` : addr

      const baseUpdates: Partial<ValuationFormData> = {
        companyName: company.name ?? '',
        kboNumber: company.kboNumber ?? '',
        legalForm: company.legalForm ?? '',
        address: addressStr,
        naceCode: company.naceCode ?? '',
        naceDescription: company.naceDescription ?? '',
        businessStructure: mapLegalFormToBusinessStructure(company.legalForm ?? ''),
      }

      setFormData((prev) => ({ ...prev, ...baseUpdates }))
      setNacePrefillError(null)

      const naceCode = company.naceCode?.trim()
      if (naceCode) {
        try {
          const bt = await naceBusinessTypeService.getBusinessTypeForNaceCode(
            naceCode,
            controller.signal
          )
          if (controller.signal.aborted) return
          if (bt) {
            const mapped: BusinessType = businessTypesForSearch.find((t) => t.id === bt.id) ?? bt
            setSelectedBusinessType(mapped)
            setFormData((prev) => ({
              ...prev,
              ...baseUpdates,
              businessType: bt.id,
              businessTypeCode: bt.code || bt.id,
              industry: bt.category || 'services',
            }))
            updateFormData({ business_type_id: bt.id, industry: bt.category })
            setNacePrefillError(null)
          } else {
            setNacePrefillError(t('errors.noBusinessTypeForNace'))
          }
        } catch (err) {
          if (controller.signal.aborted) return
          const msg =
            err instanceof Error && err.message === 'BUSINESS_TYPE_FETCH_FAILED'
              ? t('errors.businessTypeFetchFailed')
              : err instanceof Error
                ? err.message
                : t('errors.businessTypeFetchFailed')
          setNacePrefillError(msg)
        } finally {
          if (companySelectAbortRef.current === controller) {
            companySelectAbortRef.current = null
          }
        }
      } else {
        companySelectAbortRef.current = null
      }
    },
    [businessTypesForSearch, updateFormData]
  )

  const handleBusinessTypeSelect = (value: string, businessType?: BusinessType) => {
    setSelectedBusinessType(businessType || null)
    updateField('businessType', value)
    setNacePrefillError(null)
    if (businessType) {
      updateField('businessTypeCode', businessType.code)
      updateField('industry', businessType.category)
      updateFormData({ business_type_id: value, industry: businessType.category })
    } else {
      updateField('businessTypeCode', '')
      updateField('industry', '')
      updateFormData({ business_type_id: undefined, industry: undefined })
    }
  }

  const handleClearCompany = () => {
    setSelectedCompany(null)
    setCompanySearchValue('')
    setNacePrefillError(null)
    setSelectedBusinessType(null)
    setFormData((prev) => ({
      ...prev,
      companyName: '',
      kboNumber: '',
      legalForm: '',
      address: '',
      naceCode: '',
      naceDescription: '',
      businessStructure: '',
      businessType: '',
      businessTypeCode: '',
      industry: '',
    }))
    updateFormData({ business_type_id: undefined, industry: undefined })
  }


  const handleCSVFileSelected = useCallback(
    (_file: File, parsedData: ParsedCSVData) => {
      setShowCSVUpload(false)
      const source = parsedData.detectedType === 'generic' ? 'yuki' : parsedData.detectedType
      onCSVImportComplete?.(source, _file.name)
    },
    [onCSVImportComplete]
  )

  // Check if core fields are filled
  const hasCompanyInfo = !!selectedCompany || formData.companyName.length > 0
  const hasBusinessType = !!selectedBusinessType || formData.businessType.length > 0
  const hasFinancials = formData.yearlyFinancials.some(
    (yf) => (Number(yf.revenue) || 0) > 0 && hasExplicitNumericValue(yf.ebitda)
  )
  const hasEbitdaValue = formData.yearlyFinancials.some((yf) => hasExplicitNumericValue(yf.ebitda))
  const totalYearsWithEbitda = formData.yearlyFinancials.filter(
    (yf) => hasExplicitNumericValue(yf.ebitda)
  ).length
  const { canSave, reason: canSaveReason } = useCanSave()
  const canSubmit = hasCompanyInfo && hasBusinessType && hasFinancials && canSave

  // Field-level: detect partially filled years (has one of revenue/ebitda but not both)
  const partialYears = formData.yearlyFinancials
    .filter(
      (yf) =>
        ((Number(yf.revenue) || 0) > 0 && !hasExplicitNumericValue(yf.ebitda)) ||
        (hasExplicitNumericValue(yf.ebitda) && (Number(yf.revenue) || 0) <= 0)
    )
    .map((yf) => yf.year)

  // Calculate progress
  const totalSteps = 4
  const completedSteps = [
    hasCompanyInfo && hasBusinessType, // Step 1: Company
    formData.ownerManagers > 0 &&
      formData.fteEmployees !== undefined &&
      formData.fteEmployees >= 0, // Step 2: Ownership (0 FTE valid for owner-only)
    hasFinancials, // Step 3: Financials
    normalizedData.years.some((y) => y.normalizationCount > 0), // Step 4: Normalizations
  ].filter(Boolean).length

  const { result, selectedMethod } = useManualResultsStore()
  const hasOmniCalcResults =
    !!result?.valuation_results && Object.keys(result.valuation_results).length > 0
  const showValuationWorkspace = !!result
  const currentMethodLabel =
    selectedMethod === 'upswitch_adaptive'
      ? mi('valuationMethod.upswitchRecommended')
      : result?.valuation_results?.[selectedMethod]?.label || mi('valuationMethod.upswitchRecommended')

  return (
    <>
      <div className="h-full flex flex-col bg-background overflow-hidden">
        {/* Progress Header — hide when valuation complete */}
        {!hasReport && (
          <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">
                {t('calculator.businessValuation')}
              </h2>
              <span className="text-xs font-medium text-foreground/50">
                {t('calculator.stepOf', { current: Math.max(1, completedSteps), total: totalSteps })}
              </span>
            </div>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={cn(
                    'h-1 flex-1 rounded-full transition-colors',
                    step <= completedSteps ? 'bg-primary' : 'bg-foreground/10'
                  )}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
          <form onSubmit={handleSubmit} className="p-6 space-y-6 flex-1">
            <SpotlightBanner />
            <GuidedResolutionOrphanFields />

            {/* Step 1: Company Identification */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold',
                    selectedCompany ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'
                  )}
                >
                  {selectedCompany ? <Check className="w-3.5 h-3.5" /> : '1'}
                </div>
                <h3 className="text-sm font-medium text-foreground">
                  {mi('sections.companyDetails')}
                </h3>
              </div>

              {readOnlyKbo && selectedCompany ? (
                <div className="rounded-lg border border-foreground/[0.08] bg-muted/30 px-3 py-2.5">
                  <p className="text-xs text-foreground/50 mb-0.5">{mi('fields.companyNameOrKbo')}</p>
                  <p className="text-sm font-medium text-foreground">{selectedCompany.name}</p>
                  {selectedCompany.kboNumber && (
                    <p className="text-xs text-foreground/40 font-mono mt-0.5">{searchCountry === 'NL' ? 'KVK' : 'KBO'} {selectedCompany.kboNumber}</p>
                  )}
                </div>
              ) : (
                <KBOSearchInput
                  label={mi('fields.companyNameOrKbo')}
                  value={companySearchValue}
                  onChange={setCompanySearchValue}
                  onCompanySelect={handleCompanySelect}
                  selectedCompany={selectedCompany}
                  onClear={handleClearCompany}
                  searchFn={kboSearchFn}
                  minQueryLength={2}
                  debounceMs={400}
                  size="sm"
                  disabled={isCalculating}
                />
              )}

              <AnimatePresence>
                {selectedCompany && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 overflow-hidden"
                  >
                    <SpotlightFieldWrapper fieldName="industry">
                      <div className="space-y-1">
                        <div className="flex items-start gap-1.5">
                          <ProvenanceDot fieldName="industry" className="mt-2" />
                          <div className="flex-1 min-w-0">
                            <BusinessTypeSearchInput
                              label={mi('fields.businessType')}
                              value={formData.businessType}
                              onChange={handleBusinessTypeSelect}
                              types={businessTypesForSearch.length > 0 ? businessTypesForSearch : undefined}
                              loading={businessTypesLoading}
                              loadError={businessTypesError}
                              onRetryLoad={refetchBusinessTypes}
                              naceMatchedTypeId={
                                selectedCompany?.naceCode &&
                                formData.businessType?.trim() &&
                                !looksLikeNaceCode(formData.businessType)
                                  ? formData.businessType.trim()
                                  : undefined
                              }
                              size="sm"
                              disabled={isCalculating}
                            />
                          </div>
                        </div>
                      </div>
                    </SpotlightFieldWrapper>
                    {nacePrefillError && (
                      <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/20 -mt-1">
                        <p className="text-[11px] text-destructive/80">{nacePrefillError}</p>
                        <button
                          type="button"
                          onClick={() => setNaceRetryTrigger((p) => p + 1)}
                          className="text-[11px] font-medium text-primary hover:text-primary/80 shrink-0"
                        >
                          {tKbo('retry')}
                        </button>
                      </div>
                    )}
                    {selectedBusinessType && (
                      <p className="text-[11px] text-foreground/40 -mt-1">
                        {mi('businessTypeHint')}
                      </p>
                    )}

                    <AuroraSelect
                      label={mi('fields.legalForm')}
                      options={businessStructures}
                      value={formData.businessStructure}
                      onChange={(val) => updateField('businessStructure', val)}
                      size="sm"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* Step 2: Ownership & Structure */}
            {selectedCompany && hasBusinessType && (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 pt-2"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold',
                      formData.ownerManagers > 0 &&
                      formData.fteEmployees !== undefined &&
                      formData.fteEmployees >= 0
                        ? 'bg-success/10 text-success'
                        : 'bg-primary/10 text-primary'
                    )}
                  >
                    {formData.ownerManagers > 0 &&
                    formData.fteEmployees !== undefined &&
                    formData.fteEmployees >= 0 ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      '2'
                    )}
                  </div>
                  <h3 className="text-sm font-medium text-foreground">
                    {mi('sections.ownershipStructure')}
                  </h3>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="relative">
                    <AuroraInput
                      label={mi('fields.ownerManagers')}
                      type="number"
                      min={1}
                      max={10}
                      value={formData.ownerManagers || ''}
                      onChange={(e) => updateField('ownerManagers', Number(e.target.value))}
                      size="sm"
                      placeholder="1"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
                      <FieldHelpTrigger
                        context={{
                          field: 'ownerManagers',
                          label: mi('fields.ownerManagers'),
                          value: formData.ownerManagers,
                          hint: mi('ownerManagersHint'),
                        }}
                        onTrigger={onFieldHelpRequest}
                      />
                    </div>
                  </div>
                  <div>
                    <AuroraInput
                      label={mi('fields.totalFte')}
                      type="number"
                      min={0}
                      value={
                        formData.fteEmployees !== undefined && formData.fteEmployees !== null
                          ? String(formData.fteEmployees)
                          : ''
                      }
                      onChange={(e) => {
                        const raw = e.target.value
                        const value =
                          raw === ''
                            ? undefined
                            : (() => {
                                const n = Number(raw)
                                return !isNaN(n) && n >= 0 ? n : undefined
                              })()
                        updateField('fteEmployees', value)
                      }}
                      size="sm"
                      placeholder="0"
                    />
                    {(fieldValidation.errors.fteEmployees ||
                      fieldValidation.warnings.fteEmployees) && (
                      <p
                        className={`text-[10px] mt-0.5 ${fieldValidation.errors.fteEmployees ? 'text-destructive' : 'text-warning'}`}
                      >
                        {fieldValidation.errors.fteEmployees ||
                          fieldValidation.warnings.fteEmployees}
                      </p>
                    )}
                  </div>
                  <div>
                    <AuroraInput
                      label={mi('fields.equityStakePercent')}
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={equityStakeInput}
                      onChange={(e) => {
                        const { value } = e.target
                        setEquityStakeInput(value)
                        const parsed = parseShareholdingInput(value)
                        if (parsed !== undefined) {
                          updateField('equityStake', parsed)
                        }
                      }}
                      onFocus={() => setIsEditingEquityStake(true)}
                      onBlur={(e) => {
                        setIsEditingEquityStake(false)
                        const parsed = parseShareholdingInput(e.target.value)
                        const nextValue =
                          parsed === undefined
                            ? lastValidEquityStakeRef.current
                            : isShareholdingValueInRange(parsed)
                              ? parsed
                              : lastValidEquityStakeRef.current
                        const formatted = formatShareholdingInput(nextValue)
                        setEquityStakeInput(formatted)
                        updateField('equityStake', Number.parseFloat(formatted))
                      }}
                      size="sm"
                      placeholder="100"
                    />
                    {fieldValidation.errors.equityStake && (
                      <p className="text-[10px] mt-0.5 text-destructive">
                        {fieldValidation.errors.equityStake}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-foreground/40">{mi('ownershipHint')}</p>
              </motion.section>
            )}

            {/* Step 3: Multi-Year Financials */}
            {selectedCompany && hasBusinessType && (
              <motion.section
                ref={financialsStepRef}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 pt-2"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold',
                      hasFinancials ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'
                    )}
                  >
                    {hasFinancials ? <Check className="w-3.5 h-3.5" /> : '3'}
                  </div>
                  <h3 className="text-sm font-medium text-foreground">
                    {mi('sections.financialHistory')}
                  </h3>
                </div>

                {/* Instruction + inline accounting import (only visible when connected) */}
                <div className="flex items-center justify-between gap-2 -mt-1 ml-8 flex-wrap">
                  <p className="text-xs text-foreground/40">
                    {mi('financialInstruction')}
                  </p>
                  {accountingConnectedStatus && (
                    <button
                      type="button"
                      onClick={handleImportFromAccounting}
                      disabled={importingFromAccounting}
                      aria-busy={importingFromAccounting}
                      aria-label={
                        mi('importFromAccountingAria', {
                          provider: accountingProviderDisplayName(
                            accountingConnectedStatus.provider
                          ),
                        }) ||
                        `Import revenue and EBITDA from ${accountingProviderDisplayName(accountingConnectedStatus.provider)}`
                      }
                      className={cn(
                        'text-xs font-medium flex items-center gap-1.5 px-2 py-1 rounded-lg shrink-0',
                        'text-primary hover:bg-primary/10 transition-colors',
                        importingFromAccounting && 'opacity-60 cursor-not-allowed'
                      )}
                    >
                      {importingFromAccounting ? (
                        <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
                      ) : (
                        <CloudDownload className="w-3 h-3 shrink-0" aria-hidden />
                      )}
                      {mi('importFromAccounting', {
                        provider: accountingProviderDisplayName(
                          accountingConnectedStatus.provider
                        ),
                      }) ||
                        `Import from ${accountingProviderDisplayName(accountingConnectedStatus.provider)}`}
                    </button>
                  )}
                </div>
                {importAccountingError && (
                  <p className="text-xs text-destructive ml-8">{importAccountingError}</p>
                )}

                {/* Aurora EBITDA Summary Card - only when EBITDA inputs actually contain values */}
                {hasEbitdaValue && hasFinancials && totalYearsWithEbitda > 0 && (
                  <motion.div
                    className={cn(
                      "relative rounded-xl overflow-hidden transition-all duration-300",
                      normalizedData.years.some((y) => y.totalAdjustment !== 0)
                        ? "shadow-sm"
                        : ""
                    )}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    {/* Animated Aurora gradient border - Kept but made more subtle */}
                    <div
                      className="absolute inset-0 rounded-xl opacity-40"
                      style={{
                        background:
                          'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(175 60% 50%) 25%, hsl(264 80% 60%) 50%, hsl(var(--primary)) 75%, hsl(175 60% 50%) 100%)',
                        backgroundSize: '300% 300%',
                        animation: 'aurora-shift 12s ease-in-out infinite',
                        padding: '1px',
                      }}
                    />

                    {/* Inner content with solid background */}
                    <div className="relative m-[1px] rounded-[11px] bg-background p-4">
                      {/* Subtle inner glow */}
                      <div className="absolute inset-0 rounded-[11px] bg-gradient-to-br from-primary/[0.02] via-transparent to-violet-500/[0.02] pointer-events-none" />

                      <div className="relative">
                        {/* Normalization Trigger - always visible when financials entered */}
                        {hasFinancials ? (
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground/60 mb-1">
                                {mi('fields.normalizedEbitda')}
                              </p>
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-2xl font-bold text-foreground font-mono tabular-nums tracking-tight">
                                  {formatCurrency(normalizedData.averageNormalizedEbitda)}
                                </span>
                                <span className="text-xs text-foreground/50">
                                  ({normalizedData.totalYearsWithData}{' '}
                                  {normalizedData.totalYearsWithData === 1 ? mi('year') : mi('years')})
                                </span>
                                {normalizedData.years.some((y) => y.totalAdjustment !== 0) && (() => {
                                  const yearsWithData = normalizedData.years.filter(
                                    (y) => hasExplicitNumericValue(y.ebitda)
                                  )
                                  const adjSum = yearsWithData.reduce(
                                    (sum, y) =>
                                      sum + (Number.isFinite(y.totalAdjustment) ? y.totalAdjustment : 0),
                                    0
                                  )
                                  const avgAdj = yearsWithData.length > 0 ? adjSum / yearsWithData.length : 0
                                  const safeAvg = Number.isFinite(avgAdj) ? avgAdj : 0
                                  return (
                                    <span
                                      className={cn(
                                        'text-sm font-medium',
                                        safeAvg > 0 ? 'text-success' : safeAvg < 0 ? 'text-secondary' : 'text-foreground/40'
                                      )}
                                    >
                                      {safeAvg > 0 ? '+' : ''}{formatCurrency(safeAvg)}
                                    </span>
                                  )
                                })()}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 sm:shrink-0">
                              {(acceptedNormCount > 0 || taxLatencyCount > 0) && (
                                <button
                                  type="button"
                                  onClick={() => onViewAllNormalizations?.()}
                                  className="text-xs font-medium text-foreground/60 hover:text-foreground transition-colors underline underline-offset-2 decoration-foreground/20 hover:decoration-foreground/40 whitespace-nowrap"
                                >
                                  {acceptedNormCount > 0 && taxLatencyCount > 0
                                    ? `${acceptedNormCount} ${mi('normalizations', { count: acceptedNormCount })} · ${tTax('summary', { count: taxLatencyCount })}`
                                    : acceptedNormCount > 0
                                      ? `${acceptedNormCount} ${mi('normalizations', { count: acceptedNormCount })}`
                                      : tTax('summary', { count: taxLatencyCount })}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onViewAllNormalizations?.()}
                                className={cn(
                                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                                  normalizedData.years.some((y) => y.totalAdjustment !== 0)
                                    ? 'bg-background border border-foreground/10 text-foreground hover:bg-foreground/[0.02]'
                                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                                )}
                              >
                                {normalizedData.years.some((y) => y.totalAdjustment !== 0)
                                  ? mi('adjust')
                                  : mi('normalize')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-foreground/60 leading-relaxed">
                            <span className="text-foreground font-medium">
                              {mi('whyNormalize')}
                            </span>{' '}
                            {mi('whyNormalizeExplanation')}{' '}
                            <span className="text-foreground">{mi('marketConformLevels')}</span>.
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Year-by-year financial input */}
                <div className="space-y-3">
                  {formData.yearlyFinancials.map((yearData, index) => {
                    const normalizedYear = normalizedData.years.find(
                      (y) => y.year === yearData.year
                    )
                    const normCount = Number(normalizedYear?.normalizationCount ?? 0)

                    return (
                      <div
                        key={yearData.year}
                        className={cn(
                          'p-3 rounded-xl border transition-colors',
                          partialYears.includes(yearData.year)
                            ? 'border-warning/40 bg-warning/[0.03]'
                            : yearData.ebitda > 0 && yearData.revenue > 0
                              ? 'border-foreground/[0.08] bg-foreground/[0.02]'
                              : 'border-dashed border-foreground/[0.06]'
                        )}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-semibold text-foreground">
                            {yearData.year}
                          </span>
                          {normCount > 0 && (
                            <button
                              type="button"
                              onClick={() => onViewAllNormalizations?.()}
                              className="text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/15 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                            >
                              {normCount} {mi('normalizations', { count: normCount as number })}
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <SpotlightFieldWrapper fieldName="revenue" fiscalYear={yearData.year}>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <ProvenanceDot fieldName="revenue" fiscalYear={yearData.year} />
                                <CurrencyInput
                                  label={mi('fields.revenue')}
                                  value={yearData.revenue}
                                  onChange={(v) => updateYearlyFinancials(yearData.year, 'revenue', v)}
                                  size="sm"
                                  placeholder="1.500.000"
                                />
                              </div>
                              {(fieldValidation.warnings[`revenue-${yearData.year}`] ||
                                fieldValidation.errors[`revenue-${yearData.year}`]) && (
                                <p
                                  className={`text-[10px] mt-0.5 ${fieldValidation.errors[`revenue-${yearData.year}`] ? 'text-destructive' : 'text-warning'}`}
                                >
                                  {fieldValidation.errors[`revenue-${yearData.year}`] ||
                                    fieldValidation.warnings[`revenue-${yearData.year}`]}
                                </p>
                              )}
                            </div>
                          </SpotlightFieldWrapper>
                          <SpotlightFieldWrapper fieldName="ebitda" fiscalYear={yearData.year}>
                            <div className="relative">
                              <div className="flex items-center gap-1.5">
                                <ProvenanceDot fieldName="ebitda" fiscalYear={yearData.year} />
                                <CurrencyInput
                                  label={mi('fields.ebitda')}
                                  value={yearData.ebitda}
                                  onChange={(v) => updateYearlyFinancials(yearData.year, 'ebitda', v)}
                                  size="sm"
                                  placeholder="250.000"
                                />
                              </div>
                              {(fieldValidation.warnings[`ebitda-${yearData.year}`] ||
                                fieldValidation.errors[`ebitda-${yearData.year}`] ||
                                fieldValidation.warnings[`margin-${yearData.year}`]) && (
                                <p
                                  className={`text-[10px] mt-0.5 ${fieldValidation.errors[`ebitda-${yearData.year}`] ? 'text-destructive' : 'text-warning'}`}
                                >
                                  {fieldValidation.errors[`ebitda-${yearData.year}`] ||
                                    fieldValidation.warnings[`ebitda-${yearData.year}`] ||
                                    fieldValidation.warnings[`margin-${yearData.year}`]}
                                </p>
                              )}
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
                                <FieldHelpTrigger
                                  context={{
                                    field: 'ebitda',
                                    label: `EBITDA ${yearData.year}`,
                                    value: yearData.ebitda,
                                    hint: mi('ebitdaRelevantHint'),
                                    normalizationType: 'other',
                                  }}
                                  onTrigger={onFieldHelpRequest}
                                />
                              </div>
                            </div>
                          </SpotlightFieldWrapper>
                        </div>

                        {/* Show normalized EBITDA if different */}
                        {hasExplicitNumericValue(yearData.ebitda) &&
                          normalizedYear &&
                          normalizedYear.totalAdjustment !== 0 && (
                            <div className="mt-2 flex items-center justify-between text-xs">
                              <span className="text-foreground/50">
                                {mi('fields.normalizedEbitdaLabel')}
                              </span>
                              <span className={cn(
                                'font-mono font-semibold',
                                normalizedYear.totalAdjustment > 0 ? 'text-success' : 'text-secondary'
                              )}>
                                {formatCurrency(
                                  Number.isFinite(normalizedYear.normalizedEbitda) ? normalizedYear.normalizedEbitda : 0
                                )}
                                <span className="text-foreground/40 ml-1.5">
                                  {' '}({normalizedYear.totalAdjustment > 0 ? '+' : ''}
                                  {formatCurrency(normalizedYear.totalAdjustment)}{' '}
                                  {mi('fields.adjustmentSuffix')})
                                </span>
                              </span>
                            </div>
                          )}
                        {/* Partial year warning */}
                        {partialYears.includes(yearData.year) && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-warning">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{mi('fillBothFields')}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Add Year Button */}
                  {formData.yearlyFinancials.length < 5 && (
                    <button
                      type="button"
                      onClick={() => {
                        const existingYears = formData.yearlyFinancials.map((yf) => Number(yf.year))
                        const nextYear = Math.min(...existingYears) - 1
                        updateField('yearlyFinancials', [
                          ...formData.yearlyFinancials,
                          { year: String(nextYear), revenue: 0, ebitda: 0 },
                        ])
                      }}
                      className="w-full p-3 rounded-xl border border-dashed border-foreground/[0.08] text-sm text-foreground/40 hover:text-foreground/60 hover:border-foreground/[0.15] hover:bg-foreground/[0.02] transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      {mi('addYear')} (
                      {Math.min(...formData.yearlyFinancials.map((yf) => Number(yf.year))) - 1})
                    </button>
                  )}

                  {/* Valuation method is set in the report panel, not in this form */}
                  <div className="pt-4 mt-4 border-t border-foreground/[0.06]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/45 mb-2">
                      {mi('valuationMethod.sectionEyebrow')}
                    </p>
                    <div className="flex items-center gap-1.5 mb-2">
                      <h3 className="text-sm font-medium text-foreground/90">
                        {mi('valuationMethod.headlineLabel')}
                      </h3>
                      <TooltipProvider delayDuration={300}>
                        <TooltipRoot>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md text-foreground/40 hover:text-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[44px] min-h-[44px]"
                              aria-label={mi('valuationMethod.tooltipAriaLabel')}
                            >
                              <HelpCircle className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            sideOffset={8}
                            collisionPadding={16}
                            className="max-w-[280px] text-xs leading-relaxed"
                          >
                            {mi('valuationMethod.tooltip')}
                          </TooltipContent>
                        </TooltipRoot>
                      </TooltipProvider>
                    </div>
                    <div className="rounded-xl border border-dashed border-foreground/[0.10] bg-foreground/[0.02] p-4">
                      {hasOmniCalcResults && (
                        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-foreground/45">
                          {mi('valuationMethod.currentMethodLabel', { method: currentMethodLabel })}
                        </p>
                      )}
                      <p className="text-sm font-medium text-foreground">
                        {!showValuationWorkspace
                          ? mi('valuationMethod.workspaceHintPending')
                          : hasOmniCalcResults
                            ? mi('valuationMethod.workspaceHintReady')
                            : mi('valuationMethod.workspaceHintPartial')}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-foreground/55">
                        {mi('valuationMethod.workspaceHintBlurb')}
                      </p>
                      {showValuationWorkspace && (
                        <AuroraButton
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3 w-full text-xs gap-2"
                          onClick={() => {
                            document
                              .querySelector('[data-omni-calc-panel="true"]')
                              ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                          }}
                        >
                          <ArrowDown className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden />
                          {mi('valuationMethod.goToWorkspace')}
                        </AuroraButton>
                      )}
                    </div>
                  </div>
                </div>
              </motion.section>
            )}
          </form>

          {/* Sticky Bottom CTA - stays visible when scrolling (mobile keyboard) */}
          <div className="sticky bottom-0 z-20 shrink-0 px-6 py-4 border-t border-foreground/[0.06] bg-background mt-auto">
          <AuroraButton
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={isCalculating}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {isCalculating ? mi('calculating') : mi('calculateEstimate')}
          </AuroraButton>
          {!canSubmit && (
            <p className="text-center text-xs text-foreground/40 mt-2">
              {!canSave
                ? canSaveReason
                : !hasCompanyInfo
                  ? mi('validation.enterCompanyName')
                  : !hasBusinessType
                    ? mi('validation.selectBusinessType')
                    : mi('validation.enterFinancials')}
            </p>
          )}
          </div>
        </div>
      </div>

      {/* CSV Upload Modal */}
      <Modal open={showCSVUpload} onOpenChange={setShowCSVUpload}>
        <ModalContent className="max-w-2xl">
          <ModalHeader>
            <ModalTitle>{mi('importModal.title')}</ModalTitle>
            <ModalDescription>{mi('importModal.description')}</ModalDescription>
          </ModalHeader>

          <div className="py-4">
            <CSVUploadCard
              onFileSelected={handleCSVFileSelected}
              onSkip={() => setShowCSVUpload(false)}
            />
          </div>
        </ModalContent>
      </Modal>

    </>
  )
}
