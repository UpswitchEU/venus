'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  type BusinessType,
  BusinessTypeSearchInput,
  type KBOCompany,
  KBOSearchInput,
} from '@/design-system'
import { AuroraSelect } from '@/design-system/components/Select'
import { TARGET_COUNTRIES } from '../../../config/countries'
import { looksLikeNaceCode } from '../../../services/naceBusinessTypeService'
import type { ManualValuationFormData } from '../../../types/valuation'
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
  businessTypesForSearch: BusinessType[]
  businessTypesLoading: boolean
  businessTypesError?: string | null
  refetchBusinessTypes: () => void
  nacePrefillError: string | null
  retryNacePrefill: () => void
  selectedBusinessType: BusinessType | null
  effectiveMethods: string[]
  handleBusinessTypeSelect: (value: string, businessType?: BusinessType) => void
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
  businessTypesForSearch,
  businessTypesLoading,
  businessTypesError,
  refetchBusinessTypes,
  nacePrefillError,
  retryNacePrefill,
  selectedBusinessType,
  effectiveMethods,
  handleBusinessTypeSelect,
}: CompanyIdentificationSectionProps) {
  const mi = useTranslations('manualInput')
  const tKbo = useTranslations('forms.kboLookup')

  return (
    <section className="space-y-4">
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
        <div className="rounded-lg border border-foreground/[0.08] bg-muted/30 px-3 py-2.5">
          <p className="text-xs text-foreground/50 mb-0.5">
            {localizeActivityCodeCopy(mi('fields.companyNameOrKbo'))}
          </p>
          <p className="text-sm font-medium text-foreground">{selectedCompany.name}</p>
          {selectedCompany.kboNumber && (
            <p className="text-xs text-foreground/40 font-mono mt-0.5">
              {searchCountry === 'NL' ? 'KVK' : 'KBO'} {selectedCompany.kboNumber}
            </p>
          )}
        </div>
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
