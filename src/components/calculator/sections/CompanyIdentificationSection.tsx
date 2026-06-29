'use client'

import type { BusinessTypeOption as SharedBusinessTypeOption } from '@upswitch/business-type-selector'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Info } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useMemo } from 'react'
import {
  AuroraNumberInput,
  type KBOCompany,
  KBOSearchInput,
  KboConfirmedCard,
  type BusinessType as SearchBusinessType,
} from '@/design-system'
import { AuroraSelect } from '@/design-system/components/Select'
import { Tooltip } from '@/design-system/components/Tooltip'
import { getFinancialTerm } from '@/utils/locale/financial-terms'
import { TARGET_COUNTRIES } from '../../../config/countries'
import type { BusinessType as ApiBusinessType } from '../../../services/businessTypesApi'
import type { ManualValuationFormData } from '../../../types/valuation'
import { BusinessTypeSelector } from '../../BusinessTypeSelector'
import { SECTION_HEADER_ROW_CLASS, SectionStatusCircle } from './index'
import { SegmentWeightingPanel } from './SegmentWeightingPanel'

function MultipleSourceTooltipContent() {
  return (
    <div className="space-y-2 max-w-[260px]">
      <p className="font-semibold text-background text-xs leading-snug">
        Hoe wordt de multiple bepaald?
      </p>
      <p className="text-background/75 text-xs leading-relaxed">
        Multiples komen uit de Upswitch index, opgebouwd uit echte KMO-transacties in België en
        Nederland, gecorrigeerd voor sector en omvang.
      </p>
      <div className="border-t border-background/20 pt-2 text-background/60 text-[11px] leading-relaxed space-y-1">
        <div>
          <span className="font-medium text-background/80">Bron:</span> Upswitch index
        </div>
        <div>
          <span className="font-medium text-background/80">Marge:</span> p25 / mediaan / p75
          bandbreedte per sector
        </div>
        <div>
          <span className="font-medium text-background/80">Grondslag:</span> EV/EBITDA of EV/SDE
          afhankelijk van bedrijfstype
        </div>
      </div>
      <p className="border-t border-background/20 pt-2 text-background/60 text-[11px] leading-relaxed">
        Dit is de sectorbenchmark. Bedrijven met bovengemiddelde marges krijgen een
        kwaliteitspremie, dus de toegepaste multiple in het rapport kan hoger liggen dan deze
        benchmark.
      </p>
      <a
        href="https://index.upswitch.app/nl/markets/business-types"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex items-center gap-1 text-background text-[11px] font-medium underline underline-offset-2 transition-colors hover:text-background/75"
      >
        Bekijk de Upswitch index
      </a>
    </div>
  )
}

const businessStructures = [
  { value: 'bv', label: 'BV' },
  { value: 'nv', label: 'NV' },
  { value: 'eenmanszaak', label: 'Eenmanszaak' },
  { value: 'vof', label: 'VOF' },
  { value: 'cvba', label: 'CVBA' },
  { value: 'vzw', label: 'VZW' },
]

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function multipleLabelForBasis(basis: unknown): string | undefined {
  const token = String(basis ?? '')
    .trim()
    .toLowerCase()
  if (!token) return undefined
  if (token.includes('revenue')) return 'EV/Revenue'
  if (token.includes('ebitda')) return 'EV/EBITDA'
  if (token.includes('ebit')) return 'EV/EBIT'
  if (token.includes('sde')) return 'SDE'
  return undefined
}

interface CompanyIdentificationSectionProps {
  formData: ManualValuationFormData
  initialData: Partial<ManualValuationFormData>
  readOnlyKbo: boolean
  isCalculating: boolean
  selectedCompany: KBOCompany | null
  setSelectedCompany: Dispatch<SetStateAction<KBOCompany | null>>
  companySearchValue: string
  setCompanySearchValue: Dispatch<SetStateAction<string>>
  countryUserOverrideRef: MutableRefObject<boolean>
  updateField: <K extends keyof ManualValuationFormData>(
    field: K,
    value: ManualValuationFormData[K]
  ) => void
  updateFormData: (updates: Record<string, unknown>) => void
  localizeActivityCodeCopy: (text: string) => string
  searchCountry: string
  kboSearchFn: (query: string, signal?: AbortSignal) => Promise<KBOCompany[]> | KBOCompany[]
  handleCompanySelect: (company: KBOCompany) => void
  handleClearCompany: () => void
  showChangeCompanyWarning: boolean
  prefillCompanyRef: MutableRefObject<{ name: string; kbo: string } | null>
  setShowChangeCompanyWarning: Dispatch<SetStateAction<boolean>>
  executeClearCompany: () => void
  nacePrefillError: string | null
  retryNacePrefill: () => void
  selectedBusinessType: SearchBusinessType | null
  selectedBusinessTypeIds: string[]
  effectiveMethods: string[]
  handleBusinessTypeSelectionChange: (
    businessTypeIds: string[],
    selectedBusinessTypes: ApiBusinessType[]
  ) => void
  /**
   * Surface the inline benchmark-multiple override (single business type). This
   * is a preparer control — shown to accountants/advisors, hidden from owners.
   */
  allowMultipleOverride?: boolean
}

export function CompanyIdentificationSection({
  formData,
  initialData,
  readOnlyKbo,
  isCalculating,
  selectedCompany,
  setSelectedCompany,
  companySearchValue,
  setCompanySearchValue,
  countryUserOverrideRef,
  updateField,
  updateFormData,
  localizeActivityCodeCopy,
  searchCountry,
  kboSearchFn,
  handleCompanySelect,
  handleClearCompany,
  showChangeCompanyWarning,
  prefillCompanyRef,
  setShowChangeCompanyWarning,
  executeClearCompany,
  nacePrefillError,
  retryNacePrefill,
  selectedBusinessType,
  selectedBusinessTypeIds,
  effectiveMethods,
  handleBusinessTypeSelectionChange,
  allowMultipleOverride = false,
}: CompanyIdentificationSectionProps) {
  const mi = useTranslations('manualInput')
  const tKbo = useTranslations('forms.kboLookup')
  const activityCodeLabel = getFinancialTerm('activityCode', searchCountry)
    .replace(/-code$/i, '')
    .trim()
  const selectedSegments = formData.business_type_segments ?? []
  const kboCandidateById = useMemo(
    () =>
      new Map(
        (selectedCompany?.businessTypeCandidates ?? []).map((candidate) => [
          candidate.id,
          candidate,
        ])
      ),
    [selectedCompany?.businessTypeCandidates]
  )
  const selectedBusinessTypeFallbackOptions = useMemo(() => {
    const seen = new Set<string>()
    const options: SharedBusinessTypeOption[] = []

    const addOption = ({
      id,
      title,
      naceCode,
      basis,
      multiple,
      primaryMultiple,
    }: {
      id?: string | null
      title?: string | null
      naceCode?: string | null
      basis?: string | null
      multiple?: unknown
      primaryMultiple?: SharedBusinessTypeOption['primaryMultiple']
    }) => {
      const cleanId = id?.trim()
      if (!cleanId || seen.has(cleanId)) return
      seen.add(cleanId)
      const median = finiteNumber(multiple)
      const cleanBasis = basis?.trim() || undefined
      const derivedPrimaryMultiple =
        median !== undefined
          ? {
              label: multipleLabelForBasis(cleanBasis) ?? cleanBasis ?? 'Multiple',
              basis: cleanBasis,
              median,
            }
          : undefined

      options.push({
        id: cleanId,
        title: title?.trim() || cleanId,
        icon: '📊',
        categoryId: 'kbo-nace',
        categoryLabel: 'KBO/NACE',
        naceCodes: naceCode?.trim() ? [naceCode.trim()] : undefined,
        primaryMultiple: primaryMultiple ?? derivedPrimaryMultiple,
      })
    }

    for (const segment of selectedSegments) {
      addOption({
        id: segment.business_type_id,
        title: segment.business_type_title ?? kboCandidateById.get(segment.business_type_id)?.title,
        naceCode: segment.nace_code ?? kboCandidateById.get(segment.business_type_id)?.naceCode,
        basis: segment.basis ?? segment.earnings_basis,
        multiple: segment.multiple ?? segment.applied_multiple,
        primaryMultiple: kboCandidateById.get(segment.business_type_id)?.primaryMultiple,
      })
    }

    const primaryId = formData.business_type_id
    if (primaryId) {
      addOption({
        id: primaryId,
        title:
          formData.business_type_title ??
          selectedCompany?.businessTypeTitle ??
          kboCandidateById.get(primaryId)?.title,
        naceCode: selectedCompany?.canonicalNaceCode ?? selectedCompany?.naceCode,
        basis: selectedSegments[0]?.basis ?? selectedSegments[0]?.earnings_basis,
        multiple: selectedSegments[0]?.multiple ?? selectedSegments[0]?.applied_multiple,
        primaryMultiple: primaryId ? kboCandidateById.get(primaryId)?.primaryMultiple : undefined,
      })
    }

    for (const id of selectedCompany?.businessTypeIds ?? []) {
      const candidate = kboCandidateById.get(id)
      addOption({
        id,
        title: candidate?.title,
        naceCode: candidate?.naceCode,
        primaryMultiple: candidate?.primaryMultiple,
      })
    }

    return options
  }, [
    formData.business_type_id,
    formData.business_type_title,
    kboCandidateById,
    selectedCompany?.businessTypeIds,
    selectedCompany?.businessTypeTitle,
    selectedCompany?.canonicalNaceCode,
    selectedCompany?.naceCode,
    selectedSegments,
  ])
  // Write the full rebalanced weight array back onto the segments. The panel
  // owns the rebalance (weights always total 100), so we just map index→value.
  const updateSegmentWeights = (weights: number[]) => {
    const nextSegments = selectedSegments.map((segment, segmentIndex) => ({
      ...segment,
      weight: weights[segmentIndex] ?? segment.weight ?? null,
    }))
    updateField(
      'business_type_segments',
      nextSegments as ManualValuationFormData['business_type_segments']
    )
    updateFormData({ business_type_segments: nextSegments })
  }

  // Advisor override: set the EBITDA/EV multiple for a specific segment. Empty
  // reverts to the benchmark default (shown as the input placeholder).
  const updateSegmentMultiple = (index: number, multiple: string) => {
    const nextSegments = selectedSegments.map((segment, segmentIndex) =>
      segmentIndex === index
        ? {
            ...segment,
            multiple: multiple.trim() ? multiple : null,
          }
        : segment
    )
    updateField(
      'business_type_segments',
      nextSegments as ManualValuationFormData['business_type_segments']
    )
    updateFormData({ business_type_segments: nextSegments })
  }

  return (
    // `id` is a jump target for the "Sector controleren" quality-warning CTA
    // (the business-type / sector picker lives in this section).
    <section id="manual-section-company" className="space-y-4 scroll-mt-24">
      <div className={SECTION_HEADER_ROW_CLASS}>
        <SectionStatusCircle step={1} complete={!!selectedCompany} className="flex" />
        <h3 className="text-sm font-medium text-foreground">{mi('sections.companyDetails')}</h3>
      </div>

      <AuroraSelect
        label={mi('fields.operatingCountry')}
        options={TARGET_COUNTRIES.map((c) => ({
          value: c.code,
          label: `${c.flag} ${c.name} (${c.currencySymbol})`,
        }))}
        value={formData.country || initialData.country || 'BE'}
        onChange={(val) => {
          countryUserOverrideRef.current = true
          const prev = formData.country || initialData.country || 'BE'
          updateField('country', val)
          const cc = String(val).trim().toUpperCase().substring(0, 2)
          if (cc) updateFormData({ country_code: cc })
          if (val !== prev) {
            setSelectedCompany(null)
            setCompanySearchValue('')
          }
        }}
        helpText={mi('fields.operatingCountryHelp')}
        helpTextPlacement="below"
        size="sm"
        disabled={isCalculating}
      />

      {readOnlyKbo && selectedCompany ? (
        <KboConfirmedCard
          company={{
            ...selectedCompany,
            countryCode: selectedCompany.countryCode ?? searchCountry,
          }}
          activityCodeLabel={activityCodeLabel}
        />
      ) : (
        <KBOSearchInput
          label={localizeActivityCodeCopy(mi('fields.companyNameOrKbo'))}
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
          countryCode={searchCountry}
          description={searchCountry === 'NL' ? mi('registryNlSearchHint') : undefined}
          noResultsHint={searchCountry === 'NL' ? mi('registryNlNoResults') : undefined}
        />
      )}

      <AnimatePresence>
        {showChangeCompanyWarning && selectedCompany && prefillCompanyRef.current && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3.5 py-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="flex-1 min-w-0">
                <p className="text-foreground/70 text-xs leading-relaxed">
                  {mi('changeCompanyWarning.message', {
                    companyName: prefillCompanyRef.current.name,
                  })}
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowChangeCompanyWarning(false)}
                    className="rounded-lg border border-foreground/10 bg-background px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-muted"
                  >
                    {mi('changeCompanyWarning.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={executeClearCompany}
                    className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
                  >
                    {mi('changeCompanyWarning.confirm')}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedCompany && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 overflow-hidden"
          >
            <div className="space-y-1">
              <div className="flex items-start gap-1.5">
                <div className="flex-1 min-w-0">
                  <BusinessTypeSelector
                    label={mi('fields.businessType')}
                    value={selectedBusinessTypeIds}
                    onChange={() => undefined}
                    onSelectionChange={handleBusinessTypeSelectionChange}
                    fallbackOptions={selectedBusinessTypeFallbackOptions}
                    selectionMode="multiple"
                    showPreview={false}
                    showRequiredHint={false}
                    className={isCalculating ? 'pointer-events-none opacity-60' : ''}
                  />
                </div>
              </div>
            </div>
            {nacePrefillError && (
              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/20 -mt-1">
                <p className="text-[11px] text-destructive/80">{nacePrefillError}</p>
                <button
                  type="button"
                  onClick={retryNacePrefill}
                  className="text-[11px] font-medium text-primary hover:text-primary/80 shrink-0"
                >
                  {tKbo('retry')}
                </button>
              </div>
            )}
            {selectedBusinessType && (
              <div className="-mt-1 space-y-1">
                <p className="text-[11px] text-foreground/40">{mi('businessTypeHint')}</p>
                {effectiveMethods.includes('arr_multiple') ? (
                  <p className="text-[11px] text-foreground/40">
                    {mi('businessTypeArrMethodNote')}
                  </p>
                ) : null}
              </div>
            )}
            {/* Preparer override for the single-business-type case. The segment
                multiple is seeded with the sector benchmark, so the field shows
                the default pre-filled; editing it overrides via the same
                business_type_segments path used by the multi-segment panel. */}
            {allowMultipleOverride &&
              selectedSegments.length === 1 &&
              (() => {
                const segment = selectedSegments[0]
                const basis = segment.basis ?? segment.earnings_basis
                const metricLabel = multipleLabelForBasis(basis) ?? mi('appliedMultipleLabel')
                const benchmarkNumber =
                  finiteNumber(segment.multiple) ?? finiteNumber(segment.applied_multiple)
                if (benchmarkNumber === undefined && segment.multiple == null) return null
                return (
                  <div className="rounded-2xl border border-foreground/[0.10] bg-foreground/[0.03] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2">
                        {basis && (
                          <span className="rounded-md bg-foreground/[0.06] px-2 py-0.5 text-xs text-foreground/55">
                            {basis}
                          </span>
                        )}
                        <span className="text-sm font-semibold text-foreground">{metricLabel}</span>
                      </div>
                      <Tooltip
                        content={<MultipleSourceTooltipContent />}
                        side="top"
                        align="end"
                        sideOffset={8}
                        className="!py-3 !px-3 !rounded-xl"
                      >
                        <button
                          type="button"
                          className="flex items-center justify-center h-7 w-7 rounded-lg text-foreground/35 hover:text-foreground/70 hover:bg-foreground/[0.06] transition-all duration-150"
                          aria-label="Meer informatie over de multiple"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </Tooltip>
                    </div>
                    <div className="border-t border-foreground/[0.08] px-4 pb-4 pt-3">
                      <AuroraNumberInput
                        label={metricLabel}
                        placeholder={
                          benchmarkNumber !== undefined ? benchmarkNumber.toFixed(1) : 'Auto'
                        }
                        name="business_type_segments.0.multiple"
                        value={segment.multiple ?? ''}
                        onChange={(event) => updateSegmentMultiple(0, event.target.value)}
                        min={0}
                        step={0.1}
                        suffix="x"
                        allowDecimals
                        disabled={isCalculating}
                        size="sm"
                      />
                      <p className="mt-2 text-[11px] text-foreground/45">
                        {mi('appliedMultipleHint')}
                      </p>
                    </div>
                  </div>
                )
              })()}
            {selectedSegments.length > 1 && (
              <SegmentWeightingPanel
                segments={selectedSegments}
                onWeightsChange={updateSegmentWeights}
                allowMultipleOverride={allowMultipleOverride}
                onMultipleChange={allowMultipleOverride ? updateSegmentMultiple : undefined}
                disabled={isCalculating}
              />
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
  )
}
