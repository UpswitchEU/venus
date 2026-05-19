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
import { useLocale, useTranslations } from 'next-intl'
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
import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import {
  STARTUP_SECTOR_EXIT_MULTIPLES,
  STARTUP_STAGE_DEFAULT_RAISE,
  type StartupSector,
  type StartupStage,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import { mapLegalFormToBusinessStructure } from '@/utils/legalFormMapping'
import { PrefillBadge } from './PrefillBadge'
import { PresetPicker } from './PresetPicker'

interface CompanyCardStepProps {
  /** @deprecated Route locale from next-intl is used. */
  locale?: 'en' | 'nl'
  /** Forwarded by `StartupValuationPanel`; unused on this step. */
  advisorMode?: boolean
}

const STAGE_VALUES: StartupStage[] = ['pre_seed', 'seed', 'series_a']

/**
 * Country-scoped legal-form enum. The Belgian set was previously the
 * only one shipped, so a Dutch / French / German founder selecting a
 * non-BE country still saw the BE labels (BV/NV/Eenmanszaak/VOF/
 * CVBA/VZW). NL has its own canonical entities (CV, Stichting, etc.);
 * shipping the wrong list silently drove dirty data into Titan and
 * confused Mercury's downstream form. Falls back to BE for any
 * unknown country code so existing payloads keep rendering.
 */
const LEGAL_FORM_OPTIONS_BY_COUNTRY: Record<
  string,
  ReadonlyArray<{ value: string; label: string }>
> = {
  BE: [
    { value: 'bv', label: 'BV' },
    { value: 'nv', label: 'NV' },
    { value: 'eenmanszaak', label: 'Eenmanszaak' },
    { value: 'vof', label: 'VOF' },
    { value: 'cvba', label: 'CVBA' },
    { value: 'vzw', label: 'VZW' },
  ],
  NL: [
    { value: 'bv', label: 'BV' },
    { value: 'nv', label: 'NV' },
    { value: 'eenmanszaak', label: 'Eenmanszaak' },
    { value: 'vof', label: 'VOF' },
    { value: 'cv', label: 'CV (Coöperatie)' },
    { value: 'stichting', label: 'Stichting' },
  ],
  FR: [
    { value: 'sas', label: 'SAS' },
    { value: 'sasu', label: 'SASU' },
    { value: 'sarl', label: 'SARL' },
    { value: 'eurl', label: 'EURL' },
    { value: 'sa', label: 'SA' },
    { value: 'micro_entreprise', label: 'Micro-entreprise' },
  ],
  DE: [
    { value: 'gmbh', label: 'GmbH' },
    { value: 'ug', label: 'UG (haftungsbeschränkt)' },
    { value: 'ag', label: 'AG' },
    { value: 'gbr', label: 'GbR' },
    { value: 'kg', label: 'KG' },
    { value: 'einzelunternehmen', label: 'Einzelunternehmen' },
  ],
} as const

function getLegalFormOptions(countryCode: string): Array<{ value: string; label: string }> {
  return (LEGAL_FORM_OPTIONS_BY_COUNTRY[countryCode.toUpperCase()] ??
    LEGAL_FORM_OPTIONS_BY_COUNTRY.BE) as Array<{ value: string; label: string }>
}

export function CompanyCardStep(_props: CompanyCardStepProps) {
  const t = useTranslations('startupStudio.companyCard')
  const locale = useLocale()
  // Locale-aware integer formatter — matches the same Intl rules
  // CurrencyInput's display uses, so the placeholder for round size
  // never disagrees with the value the founder ends up seeing once
  // they type. NL renders "750.000", EN-BE renders "750,000".
  const placeholderIntFmt = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
        maximumFractionDigits: 0,
        useGrouping: true,
      }),
    [locale]
  )
  const stageControlOptions = useMemo(
    () =>
      STAGE_VALUES.map((value) => ({
        value,
        label: t(`stageLabels.${value}` as never),
      })),
    [t]
  )
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  // Subscribe to the applied exit multiple so the SectorChip can show
  // the *current* number (post-override), not the sector default.  Two
  // truths in the same panel was the audit finding — the chip used to
  // print `6×` while Exit Story applied `9×`.
  const appliedExitMultiple = useStartupValuationStore((s) => s.exit_revenue_multiple)
  const raise = useStartupValuationStore((s) => s.investment_amount_sought)
  const description = useStartupValuationStore((s) => s.description)
  // Traction signals — used to surface a "you might want SaaS valuation
  // instead" nudge when a seed-stage founder already has meaningful
  // recurring revenue.  Pre-seed never trips this (Berkus-heavy is
  // correct for them); Series A already has its own banner.
  const mrr = useStartupValuationStore((s) => s.mrr)
  const arr = useStartupValuationStore((s) => s.arr)
  const setField = useStartupValuationStore((s) => s.setField)
  const seedSectorFromNaceIfDefault = useStartupValuationStore((s) => s.seedSectorFromNaceIfDefault)
  const seedStageFromFoundingYearIfDefault = useStartupValuationStore(
    (s) => s.seedStageFromFoundingYearIfDefault
  )

  // Auto-seed the round size from the stage benchmark.  Two trigger
  // paths:
  //   1. First paint with raise null — fill in the stage default.
  //   2. Stage change while raise still matches *some* stage default —
  //      treat this as "founder is still on auto-seed" and re-seed
  //      to the new stage's default.  A founder who typed a custom
  //      number (e.g. €600K) won't have it match any default, so we
  //      never clobber typed values.
  // Without (2), a founder who lands on the seed default (€750K),
  // realises they're pre-seed, and flips the stage segmented control,
  // would still see €750K (vs the €250K pre-seed default) until they
  // manually clear and re-type.  Stage defaults are Atomico/Dealroom
  // 2024 cohort medians.
  useEffect(() => {
    const stageDefaults = Object.values(STARTUP_STAGE_DEFAULT_RAISE)
    const onSomeDefault = typeof raise === 'number' && stageDefaults.includes(raise)
    if (raise == null || onSomeDefault) {
      const next = STARTUP_STAGE_DEFAULT_RAISE[stage]
      if (raise !== next) {
        setField('investment_amount_sought', next)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, raise, setField])

  // Materially recurring revenue threshold for the SaaS-pivot nudge.
  //   - €10k MRR ≈ €120k ARR — the empirical pivot point where ARR
  //     multiples start producing tighter, more defensible numbers
  //     than the Berkus / VC-method blend.
  //   - We accept either MRR or ARR so that founders who only filled
  //     one of the two still get the prompt.
  //   - Audit A7 fix: nudge fires on ANY stage with material revenue,
  //     not just `seed`.  A pre-seed founder who's already monetising
  //     (rare but real) should see the same suggestion; a Series-A
  //     founder is already covered by the dedicated `seriesANudge`
  //     above so we suppress the duplicate here.
  const SEED_NUDGE_MRR_THRESHOLD = 10_000
  const SEED_NUDGE_ARR_THRESHOLD = 120_000
  const seedHasMaterialRevenue =
    stage !== 'series_a' &&
    ((typeof mrr === 'number' && mrr >= SEED_NUDGE_MRR_THRESHOLD) ||
      (typeof arr === 'number' && arr >= SEED_NUDGE_ARR_THRESHOLD))

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

  // Mercury → Venus deep-link prefill. Mercury can supply a rich
  // context envelope through URL params so the studio is already
  // filled in before the founder touches a field. The handler runs
  // exactly once on first mount (`prefilledRef` gate); each parser
  // refuses to clobber a non-empty value the founder already has, so
  // a returning user with localStorage-persisted state never has
  // their typed values overwritten.
  //
  // Honoured params (all optional, all URL-encoded):
  //   companyName / prefilledQuery → company name (120-char clamp)
  //   stage           → 'pre_seed' | 'seed' | 'series_a'
  //   sector          → one of the 8 StartupSector enum values
  //   country         → 2-letter ISO (BE / NL / FR / DE / …)
  //   mrr             → integer EUR
  //   arr             → integer EUR
  //   raise           → integer EUR (round size)
  //   pitch           → URL-encoded one-liner (240-char clamp)
  //
  // Anything not honoured is silently ignored — Mercury can keep
  // shipping experimental params without breaking the studio.
  const prefilledRef = useRef(false)
  useEffect(() => {
    if (prefilledRef.current) return
    if (typeof window === 'undefined') return
    prefilledRef.current = true
    const params = new URLSearchParams(window.location.search)
    const formStore = useManualFormStore.getState()
    const studioStore = useStartupValuationStore.getState()

    // Company name — both the legacy alias and the new one.
    const nameParam = params.get('companyName')?.trim() || params.get('prefilledQuery')?.trim()
    if (nameParam && !(formStore.formData.company_name?.trim() ?? '')) {
      updateFormData({ company_name: nameParam.slice(0, 120) })
    }

    // Stage — only flip when the param matches the enum exactly. We
    // deliberately don't gate on a "user-set" flag because the URL
    // is the single source-of-truth for first-mount intent.
    const stageParam = params.get('stage')?.trim()
    if (stageParam === 'pre_seed' || stageParam === 'seed' || stageParam === 'series_a') {
      setField('stage', stageParam)
    }

    // Sector — the store has `_sectorWasUserSet` to keep the NACE
    // seeder from clobbering an explicit pick later. The URL pre-fill
    // counts as the same kind of explicit pick.
    const sectorParam = params.get('sector')?.trim() as StartupSector | undefined
    if (sectorParam && (SECTOR_OPTIONS as ReadonlyArray<string>).includes(sectorParam)) {
      setField('sector', sectorParam)
    }

    // Country — pass through to both stores so the registry search
    // and the engine envelope agree on the same code.
    const countryParam = params.get('country')?.trim().toUpperCase()
    if (countryParam && countryParam.length === 2) {
      const currentCountry = (formStore.formData.country_code ?? '').toUpperCase()
      if (!currentCountry) {
        updateFormData({ country_code: countryParam })
        setField('country_code', countryParam)
      }
    }

    // Numeric prefills — defensive parsing rejects NaN / negative.
    const parseIntParam = (key: string): number | null => {
      const raw = params.get(key)
      if (!raw) return null
      const n = Math.round(Number(raw))
      return Number.isFinite(n) && n > 0 ? n : null
    }
    const mrrParam = parseIntParam('mrr')
    if (mrrParam != null && studioStore.mrr == null) setField('mrr', mrrParam)
    const arrParam = parseIntParam('arr')
    if (arrParam != null && studioStore.arr == null) setField('arr', arrParam)
    const raiseParam = parseIntParam('raise')
    if (raiseParam != null && studioStore.investment_amount_sought == null) {
      setField('investment_amount_sought', raiseParam)
    }

    // Pitch — 240-char clamp matches the textarea's maxLength + the
    // engine's schema cap. Only set when empty so a returning user's
    // edits never get reset by a stale URL.
    const pitchParam = params.get('pitch')?.trim()
    if (pitchParam && !(studioStore.description ?? '').trim()) {
      setField('description', pitchParam.slice(0, 240))
    }
  }, [setField, updateFormData])

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
        // Founding year — prefer the explicit numeric field, fall back
        // to the first 4-digit year found in ``startDate`` ("2018-04-12"
        // / "12/04/2018").  The studio uses this to pre-fill the funding
        // stage; missing / unparseable → ``undefined`` (caller skips).
        const foundingYearRaw = raw.founding_year
        const startDateRaw = raw.start_date
        const foundingYearFromField =
          typeof foundingYearRaw === 'number' && Number.isFinite(foundingYearRaw)
            ? foundingYearRaw
            : undefined
        const foundingYearFromStartDate = (() => {
          if (typeof startDateRaw !== 'string') return undefined
          const m = startDateRaw.match(/(19|20)\d{2}/)
          return m ? Number(m[0]) : undefined
        })()
        const foundingYear = foundingYearFromField ?? foundingYearFromStartDate
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
          foundingYear,
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
      // Founding year — registry-supplied incorporation year drives the
      // engine envelope's ``founding_year`` field AND seeds the funding
      // stage default below.  Only set when the form-store doesn't
      // already carry one (returning user, prior session, etc.) so we
      // never clobber a manually-entered year.
      if (typeof company.foundingYear === 'number' && Number.isFinite(company.foundingYear)) {
        const currentFoundingYear = useManualFormStore.getState().formData.founding_year
        if (
          currentFoundingYear === undefined ||
          currentFoundingYear === null ||
          (typeof currentFoundingYear === 'number' && currentFoundingYear === 0)
        ) {
          updates.founding_year = company.foundingYear
        }
      }
      // Bridge `legal_form` → SME `business_structure` mapping for any
      // downstream consumer that branches on it.  No-op if mapping fails.
      mapLegalFormToBusinessStructure(company.legalForm ?? '')
      updateFormData(updates)
      setField('country_code', String(updates.country_code))

      // Stage smart-default — registry incorporation year → cohort
      // bucket (pre_seed / seed / series_a).  Idempotent and bail-out
      // safe (gated on `_stageWasUserSet`); see the action's docstring
      // and ``inferStartupStageFromFoundingYear`` for the cohort math.
      // Audit 2026-05-10 prefill win.
      seedStageFromFoundingYearIfDefault(company.foundingYear ?? null)

      // Auto-fill the founder's one-line pitch from the KBO/KVK
      // activity label / NACE description ON FIRST MATCH only — never
      // clobber a pitch the founder already typed.  This is a
      // "best-available-data" prefill: the registry text isn't a real
      // pitch, but it's a strong starting point the founder can refine
      // in seconds.  120 chars matches the textarea soft-cap.
      const currentDescription = useStartupValuationStore.getState().description
      if (!currentDescription.trim()) {
        const sourceText = company.activityLabel?.trim() || company.naceDescription?.trim() || ''
        if (sourceText) {
          setField('description', sourceText.slice(0, 120))
        }
      }
    },
    [businessTypesForSearch, country, setField, updateFormData, seedStageFromFoundingYearIfDefault]
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
  // Show the free-text company-name fallback only when neither the
  // KBO/KVK registry hit nor a previously-stored name fills the field.
  // Without the second guard, founders who landed via Mercury prefill
  // (`?prefilledQuery=`) saw the same name twice — once in the search
  // box and once in the fallback input.
  const hasCompanyName = !!selectedCompany || companyName.trim().length > 0

  return (
    <div className="space-y-4">
      {/* Quick-start preset picker — compact chip strip, low visual weight */}
      <PresetPicker />

      {/* Canonical company-card section. Visual contract mirrors
          ManualInputPanel's Step 1: country select → KBO/KVK search →
          business-type search → legal form. */}
      <div className="space-y-4 rounded-2xl border border-foreground/10 bg-background/60 p-5">
        <AuroraSelect
          label={t('operatingCountry')}
          options={countryOptions}
          value={country}
          onChange={(val) => handleCountryChange(String(val))}
          size="sm"
        />

        <KBOSearchInput
          label={country === 'NL' ? t('searchCompanyNl') : t('searchCompanyBe')}
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
            !hasCompanyName
              ? country === 'NL'
                ? t('registryNl')
                : t('registryBe')
              : t('registryPdf')
          }
        />

        {/* Free-text fallback — only when the founder has no company
            name yet AT ALL.  Once they pick from the registry OR the
            form store carries a name (Mercury prefill, returning user),
            we silently hide this so the same name never appears twice. */}
        {!hasCompanyName && (
          <AuroraInput
            label={t('companyNameFallback')}
            value={companyName}
            onChange={(e) => updateFormData({ company_name: e.target.value.slice(0, 120) })}
            placeholder={t('companyNamePlaceholder')}
            maxLength={120}
            autoComplete="organization"
            size="sm"
            truncateLabel={false}
            helpText={t('registryPdf')}
            helpTextPlacement="below"
          />
        )}

        <BusinessTypeSearchInput
          label={t('businessType')}
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
          label={t('legalForm')}
          options={getLegalFormOptions(country)}
          value={legalForm}
          onChange={(val) => updateFormData({ legal_form: String(val) } as Record<string, unknown>)}
          size="sm"
        />
      </div>

      {/* Studio-specific: funding stage + round size + pitch.  These
          are the venture-engine inputs the SME company card never
          collects, surfaced as a sibling block so the canonical card
          stays untouched. */}
      <div className="space-y-4 rounded-2xl border border-foreground/10 bg-background/60 p-5">
        <div>
          <label
            htmlFor="startup-stage"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-foreground/55"
          >
            {t('fundingStage')}
          </label>
          <SegmentedControl
            options={stageControlOptions}
            value={stage}
            onChange={(value) => setField('stage', value as StartupStage)}
          />
          <p className="mt-2 text-[11px] leading-relaxed text-foreground/55">
            {t(`stageSubtitles.${stage}` as never)}
          </p>
          {stage === 'series_a' && <SwitchToArrNudge tone="amber" text={t('seriesANudge')} />}
          {seedHasMaterialRevenue && (
            <SwitchToArrNudge
              tone="sky"
              text={t('seedRevenueNudge', {
                mrr: String(Math.round((mrr ?? (arr ?? 0) / 12) / 100) / 10),
              })}
            />
          )}
        </div>

        {/* Engine-sector chip — surfaces the canonical sector enum the
            engine reads (one of 8 values) and the exit multiple it
            drives.  Until now the founder picked a "Business type" and
            never saw what sector the NACE→sector inference resolved
            to, even though that single field swings exit multiples
            from 3× (consumer / hardware) to 10× (biotech).  Inline
            override stays one click away. */}
        <SectorChip
          sector={sector}
          onChange={(next) => setField('sector', next)}
          appliedMultiple={appliedExitMultiple ?? null}
        />

        <CurrencyInput
          label={t('roundRaised')}
          value={raise ?? undefined}
          onChange={(value) => setField('investment_amount_sought', value ?? null)}
          placeholder={placeholderIntFmt.format(STARTUP_STAGE_DEFAULT_RAISE[stage])}
          size="sm"
          truncateLabel={false}
        />
        {/* Round-size provenance — the seed is wired by an effect
            higher up in this component (auto-fills from
            STARTUP_STAGE_DEFAULT_RAISE on first paint). The badge
            tells the founder whether they're still on the stage
            default or have moved off it. */}
        <div className="-mt-2">
          <PrefillBadge
            variant={
              raise == null || raise === STARTUP_STAGE_DEFAULT_RAISE[stage]
                ? 'stage_default'
                : 'your_override'
            }
          />
        </div>

        <AuroraTextarea
          label={t('pitchLabel')}
          rows={2}
          placeholder={t('pitchPlaceholder')}
          value={description ?? ''}
          onChange={(e) => setField('description', e.target.value)}
          maxLength={240}
          size="sm"
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SectorChip — read-only-by-default, one-click override
// ---------------------------------------------------------------------------

const SECTOR_OPTIONS: ReadonlyArray<StartupSector> = [
  'saas',
  'marketplace',
  'fintech',
  'biotech_healthtech',
  'deeptech_ai',
  'vertical_ai',
  'consumer',
  'hardware',
  'other',
] as const

/**
 * Render the canonical engine sector + the exit multiple it drives.
 * Founders never had a way to see what sector the NACE inference
 * picked — and therefore no way to know that "marketplace" was using
 * a 4× multiple while their pitch deck assumed 6× SaaS comps.  The
 * chip surfaces both numbers and stays out of the way until clicked.
 *
 * `appliedMultiple` is the value Exit Story is currently using.  When
 * it differs from the sector default we render the applied number with
 * a small "(default 4×)" hint so the founder sees one truth on this
 * panel, not two.  Falls back to the sector default when the founder
 * hasn't picked yet.
 */
function SectorChip({
  sector,
  onChange,
  appliedMultiple,
}: {
  sector: StartupSector
  onChange: (next: StartupSector) => void
  appliedMultiple?: number | null
}) {
  const t = useTranslations('startupStudio.companyCard')
  const tSector = useTranslations('startupStudio.narrative.sectorLabels')
  const [editing, setEditing] = useState(false)
  const sectorLabel = tSector(sector)
  const sectorDefault = STARTUP_SECTOR_EXIT_MULTIPLES[sector]
  const _multiple = appliedMultiple ?? sectorDefault
  const isOverridden = appliedMultiple != null && Math.abs(appliedMultiple - sectorDefault) > 0.01

  if (!editing) {
    // Display chip — sector label + change button only.  The exit
    // multiple that earlier iterations rendered here ("6× exit
    // benchmark") was calc context that belongs on the report, not
    // on an input chip.  Removed 2026-05-10 to keep the input panel
    // input-only.  The override marker stays because it's input
    // metadata (tells the user their value differs from the
    // sector default).
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-[12px] text-foreground/75">
        <span className="font-medium uppercase tracking-wide text-foreground/55 text-[10px]">
          {t('sectorChipLabel')}
        </span>
        <span className="font-semibold text-foreground">{sectorLabel}</span>
        {isOverridden && (
          <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-foreground/55">
            override
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="ml-auto rounded-md border border-foreground/15 bg-background px-2 py-0.5 text-[11px] font-medium text-foreground/75 transition hover:border-primary/50 hover:text-primary"
        >
          {t('sectorChipChange')}
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/[0.03] p-3">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-primary">
        {t('sectorChipPickHeading')}
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {SECTOR_OPTIONS.map((opt) => {
          const isSelected = opt === sector
          return (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt)
                setEditing(false)
              }}
              className={[
                'rounded-md px-2 py-1.5 text-[11px] font-medium transition',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-foreground/15 bg-background text-foreground/75 hover:border-primary/50 hover:text-primary',
              ].join(' ')}
            >
              {tSector(opt)}{' '}
              <span className="opacity-65 tabular-nums">{STARTUP_SECTOR_EXIT_MULTIPLES[opt]}×</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] text-foreground/55">{t('sectorChipPickHint')}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SwitchToArrNudge — surfaces the Series-A and post-revenue-seed
// nudges with a clickable "Switch to ARR multiple" CTA. The text-only
// nudge that was here before told the founder to "select the SaaS
// valuation from the method selector" — but the method selector lives
// somewhere else entirely, so the founder either ignored the prompt
// or lost their inputs hunting for it. The CTA flips
// `useManualResultsStore.selectedMethod` directly so the swap happens
// in place, with all studio inputs preserved.
// ---------------------------------------------------------------------------

interface SwitchToArrNudgeProps {
  tone: 'amber' | 'sky'
  text: string
}

function SwitchToArrNudge({ tone, text }: SwitchToArrNudgeProps) {
  const t = useTranslations('startupStudio.companyCard')
  const setSelectedMethod = useManualResultsStore((s) => s.setSelectedMethod)
  const cls =
    tone === 'amber'
      ? 'border-amber-300/50 bg-amber-50/60 text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/25 dark:text-amber-200'
      : 'border-sky-300/50 bg-sky-50/60 text-sky-800 dark:border-sky-700/40 dark:bg-sky-950/25 dark:text-sky-200'
  const btnCls =
    tone === 'amber'
      ? 'border-amber-500 bg-amber-500 text-white hover:bg-amber-600'
      : 'border-sky-500 bg-sky-500 text-white hover:bg-sky-600'
  return (
    <div className={`mt-3 rounded-lg border p-3 text-[11px] leading-relaxed ${cls}`}>
      <p>{text}</p>
      <button
        type="button"
        onClick={() => setSelectedMethod('arr_multiple')}
        aria-label={t('switchToArrAria')}
        className={`mt-2 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${btnCls}`}
      >
        {t('switchToArrCta')}
      </button>
    </div>
  )
}
