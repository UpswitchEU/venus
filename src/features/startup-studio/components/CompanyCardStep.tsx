'use client'

/**
 * CompanyCardStep — Studio v2 first section.
 *
 * Mirrors the canonical "Company Identification" card used by every
 * other valuation method in `ManualInputPanel.tsx` so the founder /
 * advisor sees the same first-section UX they recognise from DCF /
 * SaaS / NAV / Adaptive: a country dropdown, a KBO (BE) / KVK (NL)
 * registry search, a Titan-resolved business-types dropdown, and a
 * legal-form selector.
 *
 * Ownership of the bridge to the downstream report pipeline:
 *   - The selected company writes through to `useManualFormStore`
 *     (company_name, country_code, kbo_number, legal_form, nace_code,
 *     nace_description, business_type_id, industry).  These are read
 *     verbatim by `buildStartupValuationRequest` when the report page
 *     auto-fires the calculation.
 *   - The Studio store still owns wizard-only fields (stage, sector,
 *     description, evidence, milestones).  We keep `sector` synced via
 *     `seedSectorFromNaceIfDefault` so the live triangulation in the
 *     right rail picks up the canonical NACE-mapped sector for free.
 *
 * Studio-specific affordances kept on this step:
 *   - Funding-stage segmented control (pre-seed / seed / series A) —
 *     drives the regional benchmark in the live rail.
 *   - Round-to-raise input — drives the cap-table simulator.
 *   - One-line pitch — surfaces in the investor PDF.
 *   - Preset picker — pre-fills a defensible baseline in one click.
 */

import { Building2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CurrencyInput } from '@/components/calculator/CurrencyInput'
import { TARGET_COUNTRIES } from '@/config/countries'
import {
  type BusinessType,
  BusinessTypeSearchInput,
  categoryIcons,
  type KBOCompany,
  KBOSearchInput,
} from '@/design-system'
import { AuroraInput, AuroraTextarea } from '@/design-system/components/Input'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { AuroraSelect } from '@/design-system/components/Select'
import { useBusinessTypes } from '@/hooks/useBusinessTypes'
import { registryService } from '@/services/registry/registryService'
import type { CompanySearchResult } from '@/services/registry/types'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import {
  type StartupStage,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import { mapLegalFormToBusinessStructure } from '@/utils/legalFormMapping'
import { PresetPicker } from './PresetPicker'

interface CompanyCardStepProps {
  locale?: 'en' | 'nl'
}

const STAGE_OPTIONS: { value: StartupStage; label: { en: string; nl: string } }[] = [
  { value: 'pre_seed', label: { en: 'Pre-seed', nl: 'Pre-seed' } },
  { value: 'seed', label: { en: 'Seed', nl: 'Seed' } },
  { value: 'series_a', label: { en: 'Series A', nl: 'Series A' } },
]

const LEGAL_FORM_OPTIONS = [
  { value: 'bv', label: 'BV' },
  { value: 'nv', label: 'NV' },
  { value: 'eenmanszaak', label: 'Eenmanszaak' },
  { value: 'vof', label: 'VOF' },
  { value: 'cvba', label: 'CVBA' },
  { value: 'vzw', label: 'VZW' },
]

export function CompanyCardStep({ locale = 'en' }: CompanyCardStepProps) {
  const stage = useStartupValuationStore((s) => s.stage)
  const raise = useStartupValuationStore((s) => s.investment_amount_sought)
  const description = useStartupValuationStore((s) => s.description)
  const setField = useStartupValuationStore((s) => s.setField)
  const seedSectorFromNaceIfDefault = useStartupValuationStore((s) => s.seedSectorFromNaceIfDefault)

  // Identity bridge — every field here writes to the Manual store so
  // `buildStartupValuationRequest` (called server-side by the report
  // page once the user lands on /reports/{id}) sees a fully populated
  // request envelope identical to what an SME flow would produce.
  const companyName = useManualFormStore((s) => s.formData.company_name ?? '')
  const country = useManualFormStore((s) => (s.formData.country_code ?? 'BE').toUpperCase())
  const businessTypeId = useManualFormStore((s) => s.formData.business_type_id ?? '')
  const legalForm = useManualFormStore(
    (s) => (s.formData as { legal_form?: string }).legal_form ?? ''
  )
  const naceCode = useManualFormStore(
    (s) => (s.formData as { nace_code?: string }).nace_code ?? null
  )
  const updateFormData = useManualFormStore((s) => s.updateFormData)

  const [companySearchValue, setCompanySearchValue] = useState(companyName)
  const [selectedCompany, setSelectedCompany] = useState<KBOCompany | null>(null)

  // Surface the live company search value when the underlying store
  // hydrates after first paint (Mercury → Venus deep-link with KBO
  // prefill).  Without this the founder would see an empty search box
  // and a populated form-store at the same time on a hard refresh.
  useEffect(() => {
    if (companyName && companyName !== companySearchValue) {
      setCompanySearchValue(companyName)
    }
  }, [companyName, companySearchValue])

  // PLG smart-default: when the canonical NACE flips to a recognisable
  // sector, mirror it into the Studio store so the live preview rail
  // picks the right regional benchmark and the SaaS leg blends in only
  // when sector === 'saas'.  Idempotent — the store guard
  // `_sectorWasUserSet` blocks override.
  useEffect(() => {
    seedSectorFromNaceIfDefault(naceCode)
  }, [naceCode, seedSectorFromNaceIfDefault])

  // Mercury KBO calculator → Studio handoff: when a founder lands here
  // via `?prefilledQuery=Acme%20Robotics`, seed the company-name field
  // exactly once.  Only prefill when the field is empty so we never
  // clobber a name the founder already typed (or one that was prefilled
  // by a previous KBO lookup and persisted in the form store).  The
  // 120-char clamp matches the input's `maxLength` and the schema cap
  // enforced server-side by the Manual valuation request builder.
  const prefilledRef = useRef(false)
  useEffect(() => {
    if (prefilledRef.current) return
    if (typeof window === 'undefined') return
    prefilledRef.current = true
    const params = new URLSearchParams(window.location.search)
    const query = params.get('prefilledQuery')?.trim()
    if (!query) return
    const current = useManualFormStore.getState().formData.company_name?.trim() ?? ''
    if (current) return
    updateFormData({ company_name: query.slice(0, 120) })
  }, [updateFormData])

  // -------------------------------------------------------------------
  // Country
  // -------------------------------------------------------------------
  const countryOptions = useMemo(
    () =>
      TARGET_COUNTRIES.map((c) => ({
        value: c.code,
        label: `${c.flag} ${c.name} (${c.currencySymbol})`,
      })),
    []
  )

  const handleCountryChange = useCallback(
    (next: string) => {
      const code = String(next).toUpperCase()
      updateFormData({ country_code: code })
      setField('country_code', code)
      // Clear the company selection — KBO/KVK results from the previous
      // country are no longer trustworthy.  The KBO field clears too so
      // the founder doesn't keep a dangling stale name.
      setSelectedCompany(null)
      setCompanySearchValue('')
      updateFormData({
        company_name: '',
        kbo_number: undefined,
        legal_form: undefined,
        nace_code: undefined,
        nace_description: undefined,
        business_type_id: undefined,
        industry: undefined,
      } as Record<string, unknown>)
    },
    [setField, updateFormData]
  )

  // -------------------------------------------------------------------
  // KBO / KVK registry search — same network path as ManualInputPanel
  // -------------------------------------------------------------------
  const kboSearchFn = useCallback(
    async (query: string, signal?: AbortSignal): Promise<KBOCompany[]> => {
      if (!query || query.trim().length < 2) return []
      const response = await registryService.searchCompanies(query.trim(), country, 15, signal)
      if (!response.success) {
        throw new Error(response.error || 'Registry unavailable')
      }
      if (!response.results) return []
      return response.results.map((r: CompanySearchResult, index: number) => {
        const raw = r as unknown as Record<string, unknown>
        const canonical = (r.canonical_nace_code || r.nace_code)?.trim() || ''
        const activity = (r.activity_code || '').trim()
        const displayActivity =
          activity && canonical && activity !== canonical ? activity : undefined
        const btIdRaw = raw.business_type_id
        const btTitleRaw = raw.business_type_title
        const businessTypeId =
          typeof btIdRaw === 'string' && btIdRaw.trim() ? btIdRaw.trim() : undefined
        const businessTypeTitle =
          typeof btTitleRaw === 'string' && btTitleRaw.trim() ? btTitleRaw.trim() : undefined
        return {
          id:
            r.company_id ||
            (r.kbo_number || r.registration_number || `kbo-${index}`).replace(/[.\s]/g, ''),
          name: r.company_name,
          kboNumber: r.kbo_number || r.registration_number,
          legalForm: typeof r.legal_form === 'string' ? r.legal_form : '',
          address: [r.address, r.postal_code, r.city].filter(Boolean).join(', '),
          postalCode: r.postal_code || '',
          city: r.city || '',
          naceCode: canonical,
          naceDescription: (r.activity_label || r.nace_description || '').trim() || '',
          canonicalNaceCode: canonical || undefined,
          activityCode: displayActivity,
          activityLabel: (r.activity_label || r.nace_description || '').trim() || undefined,
          activityTaxonomy: r.taxonomy,
          countryCode: r.country_code || country,
          businessTypeId,
          businessTypeTitle,
        }
      })
    },
    [country]
  )

  // -------------------------------------------------------------------
  // Business types (canonical Titan list)
  // -------------------------------------------------------------------
  const {
    businessTypes,
    loading: businessTypesLoading,
    error: businessTypesError,
    refetch: refetchBusinessTypes,
  } = useBusinessTypes()

  const businessTypesForSearch = useMemo<BusinessType[]>(() => {
    return businessTypes.map((bt) => {
      const cat =
        typeof bt.category === 'string'
          ? bt.category
          : ((bt.category as Record<string, unknown>)?.name ??
            (bt.category as Record<string, unknown>)?.title ??
            'other')
      const rawCategory = String(cat).toLowerCase().replace(/\s+/g, '-')
      const category = categoryIcons[rawCategory] ? rawCategory : 'other'
      return {
        id: bt.id,
        code: bt.industryMapping || bt.id,
        name: bt.title,
        category,
        icon: categoryIcons[rawCategory] ?? categoryIcons.other ?? Building2,
        emoji: bt.icon || '🏢',
        popular: bt.popular ?? false,
      }
    })
  }, [businessTypes])

  // -------------------------------------------------------------------
  // Selection handlers
  // -------------------------------------------------------------------
  const handleCompanySelect = useCallback(
    (company: KBOCompany) => {
      setSelectedCompany(company)
      setCompanySearchValue(company.name)
      const canonical = company.canonicalNaceCode?.trim() || company.naceCode?.trim() || ''
      const updates: Record<string, unknown> = {
        company_name: company.name,
        kbo_number: company.kboNumber ?? '',
        legal_form: company.legalForm ?? '',
        country_code: (company.countryCode || country).toUpperCase(),
        nace_code: canonical || undefined,
        nace_description: company.naceDescription || undefined,
      }
      if (company.businessTypeId) {
        const mapped = businessTypesForSearch.find((bt) => bt.id === company.businessTypeId)
        updates.business_type_id = company.businessTypeId
        if (mapped) {
          updates.industry = mapped.category
        }
      }
      // Bridge `legal_form` → SME `business_structure` mapping for any
      // downstream consumer that branches on it.  No-op if mapping fails.
      mapLegalFormToBusinessStructure(company.legalForm ?? '')
      updateFormData(updates)
      setField('country_code', String(updates.country_code))
    },
    [businessTypesForSearch, country, setField, updateFormData]
  )

  const handleClearCompany = useCallback(() => {
    setSelectedCompany(null)
    setCompanySearchValue('')
    updateFormData({
      company_name: '',
      kbo_number: undefined,
      legal_form: undefined,
      nace_code: undefined,
      nace_description: undefined,
      business_type_id: undefined,
      industry: undefined,
    } as Record<string, unknown>)
  }, [updateFormData])

  const handleBusinessTypeSelect = useCallback(
    (value: string, businessType?: BusinessType) => {
      updateFormData({
        business_type_id: value,
        industry: businessType?.category,
      } as Record<string, unknown>)
    },
    [updateFormData]
  )

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  return (
    <div className="space-y-5">
      {/* Quick-start preset picker (Studio-specific helper) */}
      <PresetPicker locale={locale} />

      {/* Canonical company-card section. Visual contract = identical to
          ManualInputPanel's Step 1: country select → KBO/KVK search →
          business-type search → legal form. */}
      <div className="space-y-4 rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <AuroraSelect
          label={locale === 'nl' ? 'Land van vestiging' : 'Operating country'}
          options={countryOptions}
          value={country}
          onChange={(val) => handleCountryChange(String(val))}
          helpText={
            locale === 'nl'
              ? 'Bepaalt de KBO/KVK-zoekbron en de regionale benchmark.'
              : 'Drives the KBO/KVK lookup and the regional benchmark.'
          }
          helpTextPlacement="below"
          size="sm"
        />

        <KBOSearchInput
          label={
            country === 'NL'
              ? locale === 'nl'
                ? 'Bedrijfsnaam of KVK-nummer'
                : 'Company name or KVK number'
              : locale === 'nl'
                ? 'Bedrijfsnaam of KBO-nummer'
                : 'Company name or KBO number'
          }
          value={companySearchValue}
          onChange={setCompanySearchValue}
          onCompanySelect={handleCompanySelect}
          selectedCompany={selectedCompany}
          onClear={handleClearCompany}
          searchFn={kboSearchFn}
          minQueryLength={2}
          debounceMs={400}
          countryCode={country}
          size="sm"
          description={
            country === 'NL'
              ? locale === 'nl'
                ? 'Zoek in het Handelsregister van de KvK.'
                : 'Search the KvK trade registry.'
              : locale === 'nl'
                ? 'Zoek in het KBO.'
                : 'Search the KBO registry.'
          }
        />

        {/* Founder-only flow without a registry hit: still need a name on
            the PDF.  Free-text fallback that writes through to the form
            store directly so `buildStartupValuationRequest` picks it up. */}
        {!selectedCompany && (
          <AuroraInput
            label={locale === 'nl' ? 'Of: typ je bedrijfsnaam' : 'Or: type your company name'}
            value={companyName}
            onChange={(e) => updateFormData({ company_name: e.target.value.slice(0, 120) })}
            placeholder={locale === 'nl' ? 'Bv. Henchman' : 'e.g. Henchman'}
            maxLength={120}
            autoComplete="organization"
            size="sm"
            helpText={
              locale === 'nl'
                ? 'Verschijnt op je investor-ready PDF rapport.'
                : 'Shows up on your investor-ready PDF report.'
            }
            helpTextPlacement="below"
          />
        )}

        <BusinessTypeSearchInput
          label={locale === 'nl' ? 'Bedrijfstype (sector)' : 'Business type (sector)'}
          value={businessTypeId}
          onChange={handleBusinessTypeSelect}
          types={businessTypesForSearch.length > 0 ? businessTypesForSearch : undefined}
          loading={businessTypesLoading}
          loadError={businessTypesError}
          onRetryLoad={refetchBusinessTypes}
          naceMatchedTypeId={
            selectedCompany?.naceCode && businessTypeId ? businessTypeId : undefined
          }
          countryCode={country}
          size="sm"
        />

        <AuroraSelect
          label={locale === 'nl' ? 'Rechtsvorm' : 'Legal form'}
          options={LEGAL_FORM_OPTIONS}
          value={legalForm}
          onChange={(val) => updateFormData({ legal_form: String(val) } as Record<string, unknown>)}
          size="sm"
        />
      </div>

      {/* Studio-specific: funding stage + round size. These are the
          inputs the venture engine consumes that the SME company card
          doesn't surface. */}
      <div className="space-y-4 rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground/80">
            {locale === 'nl' ? 'Funding stage' : 'Funding stage'}
          </label>
          <SegmentedControl
            options={STAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label[locale] }))}
            value={stage}
            onChange={(value) => setField('stage', value as StartupStage)}
          />
          <p className="mt-2 text-xs text-foreground/55">
            {locale === 'nl'
              ? 'Bepaalt de regionale benchmark + slimme defaults voor exit-multiple en target ROI.'
              : 'Drives the regional benchmark + smart defaults for exit-multiple and target ROI.'}
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground/80">
            {locale === 'nl' ? 'Op te halen ronde (€)' : 'Round being raised (€)'}
          </label>
          <CurrencyInput
            value={raise ?? undefined}
            onChange={(value) => setField('investment_amount_sought', value ?? null)}
            placeholder="500.000"
          />
          <p className="mt-2 text-xs text-foreground/55">
            {locale === 'nl'
              ? 'Voedt de cap-table simulator en de pre-money calculatie.'
              : 'Drives the cap-table simulator and the pre-money calculation.'}
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground/80">
            {locale === 'nl' ? 'Korte pitch (1 zin)' : 'One-line pitch (optional)'}
          </label>
          <AuroraTextarea
            rows={2}
            placeholder={
              locale === 'nl'
                ? 'Bv. "Wij helpen Belgische advocatenkantoren contracten 10× sneller analyseren."'
                : 'e.g. "We help Belgian law firms analyse contracts 10× faster."'
            }
            value={description ?? ''}
            onChange={(e) => setField('description', e.target.value)}
            maxLength={240}
          />
        </div>
      </div>
    </div>
  )
}
