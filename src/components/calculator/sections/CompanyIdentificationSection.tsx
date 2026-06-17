'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  AuroraNumberInput,
  type KBOCompany,
  KBOSearchInput,
  KboConfirmedCard,
  type BusinessType as SearchBusinessType,
} from '@/design-system'
import { AuroraSelect } from '@/design-system/components/Select'
import { getFinancialTerm } from '@/utils/locale/financial-terms'
import { TARGET_COUNTRIES } from '../../../config/countries'
import type { BusinessType as ApiBusinessType } from '../../../services/businessTypesApi'
import type { ManualValuationFormData } from '../../../types/valuation'
import { BusinessTypeSelector } from '../../BusinessTypeSelector'
import { SECTION_HEADER_ROW_CLASS, SectionStatusCircle } from './index'

const businessStructures = [
  { value: 'bv', label: 'BV' },
  { value: 'nv', label: 'NV' },
  { value: 'eenmanszaak', label: 'Eenmanszaak' },
  { value: 'vof', label: 'VOF' },
  { value: 'cvba', label: 'CVBA' },
  { value: 'vzw', label: 'VZW' },
]

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
}: CompanyIdentificationSectionProps) {
  const mi = useTranslations('manualInput')
  const tKbo = useTranslations('forms.kboLookup')
  const activityCodeLabel = getFinancialTerm('activityCode', searchCountry)
    .replace(/-code$/i, '')
    .trim()
  const selectedSegments = formData.business_type_segments ?? []
  const updateSegmentEarnings = (index: number, earnings: string) => {
    const nextSegments = selectedSegments.map((segment, segmentIndex) =>
      segmentIndex === index
        ? {
            ...segment,
            earnings: earnings.trim() ? earnings : null,
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
                    selectionMode="multiple"
                    showPreview={selectedBusinessTypeIds.length <= 1}
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
            {selectedSegments.length > 1 && (
              <div className="rounded-xl border border-foreground/[0.10] bg-foreground/[0.03] p-3">
                <div className="mb-2 text-xs font-semibold text-foreground">Segment earnings</div>
                <div className="space-y-3">
                  {selectedSegments.map((segment, index) => {
                    const basis = segment.basis ?? segment.earnings_basis
                    const multiple =
                      typeof segment.multiple === 'number' || typeof segment.multiple === 'string'
                        ? segment.multiple
                        : segment.applied_multiple
                    const multipleNumber = Number(multiple)

                    return (
                      <div
                        key={`${segment.business_type_id}-${index}`}
                        className="grid gap-3 border-t border-foreground/[0.08] pt-3 md:grid-cols-[minmax(0,1fr)_180px]"
                      >
                        <div className="min-w-0 self-center">
                          <div className="truncate text-sm font-medium text-foreground">
                            {segment.business_type_title ?? segment.business_type_id}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-foreground/60">
                            {basis && (
                              <span className="rounded-md bg-foreground/[0.06] px-2 py-1">
                                {basis}
                              </span>
                            )}
                            {Number.isFinite(multipleNumber) && (
                              <span className="rounded-md bg-foreground/[0.06] px-2 py-1">
                                {multipleNumber.toFixed(1)}x
                              </span>
                            )}
                          </div>
                        </div>
                        <AuroraNumberInput
                          label={basis ? `${basis} earnings` : 'Segment earnings'}
                          placeholder="0"
                          name={`business_type_segments.${index}.earnings`}
                          value={segment.earnings ?? ''}
                          onChange={(event) => updateSegmentEarnings(index, event.target.value)}
                          min={0}
                          step={1000}
                          prefix="EUR"
                          formatAsCurrency
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
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
