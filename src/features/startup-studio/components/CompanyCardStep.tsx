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

import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BusinessTypeSelector } from '@/components/BusinessTypeSelector'
import { CurrencyInput } from '@/components/calculator/CurrencyInput'
import {
  buildBusinessTypeFormData,
  buildBusinessTypeSegmentsFormData,
  resolveBusinessTypesFromKboCompany,
  selectedBusinessTypeIdsFromFormData,
} from '@/components/ValuationForm/utils/businessTypeFormData'
import { TARGET_COUNTRIES } from '@/config/countries'
import { AuroraNumberInput, type KBOCompany, KBOSearchInput } from '@/design-system'
import { AuroraInput, AuroraTextarea } from '@/design-system/components/Input'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { AuroraSelect } from '@/design-system/components/Select'
import {
  coerceStudioLocale,
  studioIntlLocale,
} from '@/features/startup-studio/i18n/useStudioLocale'
import { deriveCompanyCardPrefillPlan } from '@/features/startup-studio/utils/companyCardPrefill'
import {
  buildBusinessStructurePatch,
  buildCompanyCardClearPatch,
  buildCompanyCardCountryResetPatch,
  formatMaterialRevenueNudgeMrr,
  getLegalFormOptions,
  hasMaterialRecurringRevenue,
  resolveStageDefaultRaiseSeed,
  updateSegmentEarningsValue,
  updateSegmentWeightValue,
} from '@/features/startup-studio/utils/companyCardStepModel'
import { STARTUP_STUDIO_STAGES } from '@/features/startup-studio/utils/studioDeepLinkContract'
import { useBusinessTypes } from '@/hooks/useBusinessTypes'
import type { BusinessType as ApiBusinessType } from '@/services/businessTypesApi'
import { registryService } from '@/services/registry/registryService'
import type { CompanySearchResult } from '@/services/registry/types'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import {
  STARTUP_STAGE_DEFAULT_RAISE,
  type StartupStage,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import { mapRegistrySearchResultToKboCompany } from '@/utils/mapRegistrySearchResultToKboCompany'
import { CompanySectorChip } from './CompanySectorChip'
import { PrefillBadge } from './PrefillBadge'
import { PresetPicker } from './PresetPicker'
import { SwitchToArrNudge } from './SwitchToArrNudge'

interface CompanyCardStepProps {
  /** @deprecated Route locale from next-intl is used. */
  locale?: 'en' | 'nl' | 'fr'
  /** Forwarded by `StartupValuationPanel`; unused on this step. */
  advisorMode?: boolean
}

export function CompanyCardStep(_props: CompanyCardStepProps) {
  const t = useTranslations('startupStudio.companyCard')
  const locale = coerceStudioLocale(useLocale())
  // Locale-aware integer formatter — matches the same Intl rules
  // CurrencyInput's display uses, so the placeholder for round size
  // never disagrees with the value the founder ends up seeing once
  // they type. NL renders "750.000", EN-BE renders "750,000".
  const placeholderIntFmt = useMemo(
    () =>
      new Intl.NumberFormat(studioIntlLocale(locale), {
        maximumFractionDigits: 0,
        useGrouping: true,
      }),
    [locale]
  )
  const stageControlOptions = useMemo(
    () =>
      STARTUP_STUDIO_STAGES.map((value) => ({
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
    const next = resolveStageDefaultRaiseSeed({ stage, raise })
    if (next != null) {
      setField('investment_amount_sought', next)
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
  const seedHasMaterialRevenue = hasMaterialRecurringRevenue({ stage, mrr, arr })

  // Identity bridge — every field here writes to the Manual store so
  // `buildStartupValuationRequest` (called server-side by the report
  // page once the user lands on /reports/{id}) sees a fully populated
  // request envelope identical to what an SME flow would produce.
  const companyName = useManualFormStore((s) => s.formData.company_name ?? '')
  const country = useManualFormStore((s) => (s.formData.country_code ?? 'BE').toUpperCase())
  const businessTypeId = useManualFormStore((s) => s.formData.business_type_id ?? '')
  const businessTypeSegments = useManualFormStore((s) => s.formData.business_type_segments ?? [])
  const legalForm = useManualFormStore(
    (s) => (s.formData as { legal_form?: string }).legal_form ?? ''
  )
  const businessStructure = useManualFormStore(
    (s) => (s.formData as { business_structure?: string }).business_structure
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

  useEffect(() => {
    const patch = buildBusinessStructurePatch(legalForm)
    if (patch.business_structure !== businessStructure) {
      updateFormData(patch)
    }
  }, [businessStructure, legalForm, updateFormData])

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
    const formStore = useManualFormStore.getState()
    const studioStore = useStartupValuationStore.getState()

    const prefill = deriveCompanyCardPrefillPlan(window.location.search, {
      companyName: formStore.formData.company_name,
      countryCode: formStore.formData.country_code,
      mrr: studioStore.mrr,
      arr: studioStore.arr,
      investmentAmountSought: studioStore.investment_amount_sought,
      description: studioStore.description,
    })

    if (Object.keys(prefill.formPatch).length > 0) {
      updateFormData(prefill.formPatch)
    }

    const { studioPatch } = prefill
    if (studioPatch.stage) setField('stage', studioPatch.stage)
    if (studioPatch.sector) setField('sector', studioPatch.sector)
    if (studioPatch.country_code) setField('country_code', studioPatch.country_code)
    if (studioPatch.mrr != null) setField('mrr', studioPatch.mrr)
    if (studioPatch.arr != null) setField('arr', studioPatch.arr)
    if (studioPatch.investment_amount_sought != null) {
      setField('investment_amount_sought', studioPatch.investment_amount_sought)
    }
    if (studioPatch.description) setField('description', studioPatch.description)
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
      updateFormData(buildCompanyCardCountryResetPatch(code))
      setField('country_code', code)
      // Clear the company selection — KBO/KVK results from the previous
      // country are no longer trustworthy.  The KBO field clears too so
      // the founder doesn't keep a dangling stale name.
      setSelectedCompany(null)
      setCompanySearchValue('')
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
      return response.results.map((r: CompanySearchResult, index: number) =>
        mapRegistrySearchResultToKboCompany(r, { index, searchCountry: country })
      )
    },
    [country]
  )

  // -------------------------------------------------------------------
  // Business types (canonical Titan list)
  // -------------------------------------------------------------------
  const { businessTypes } = useBusinessTypes()

  const selectedBusinessTypeIds = useMemo(
    () =>
      selectedBusinessTypeIdsFromFormData({
        business_type_id: businessTypeId,
        business_type_segments: businessTypeSegments,
      }),
    [businessTypeId, businessTypeSegments]
  )

  // -------------------------------------------------------------------
  // Selection handlers
  // -------------------------------------------------------------------
  const applyBusinessTypeSelection = useCallback(
    (selectedBusinessTypes: ApiBusinessType[], extraUpdates: Record<string, unknown> = {}) => {
      const primaryBusinessType = selectedBusinessTypes[0]
      if (!primaryBusinessType) {
        updateFormData({
          ...extraUpdates,
          business_type_id: undefined,
          business_type_title: undefined,
          business_type_segments: [],
          business_model: undefined,
          industry: undefined,
        } as Record<string, unknown>)
        return
      }

      const primaryPatch = buildBusinessTypeFormData(primaryBusinessType)
      const segmentPatch = buildBusinessTypeSegmentsFormData(
        selectedBusinessTypes,
        businessTypeSegments
      )

      updateFormData({
        ...extraUpdates,
        ...primaryPatch,
        ...segmentPatch,
      } as Record<string, unknown>)
    },
    [businessTypeSegments, updateFormData]
  )

  const handleCompanySelect = useCallback(
    (company: KBOCompany) => {
      setSelectedCompany(company)
      setCompanySearchValue(company.name)
      const canonical = company.canonicalNaceCode?.trim() || company.naceCode?.trim() || ''
      const updates: Record<string, unknown> = {
        company_name: company.name,
        kbo_number: company.kboNumber ?? '',
        legal_form: company.legalForm ?? '',
        ...buildBusinessStructurePatch(company.legalForm),
        country_code: (company.countryCode || country).toUpperCase(),
        nace_code: canonical || undefined,
        nace_description: company.naceDescription || undefined,
      }
      const seededBusinessTypes = resolveBusinessTypesFromKboCompany(company, businessTypes)
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
      if (seededBusinessTypes.length > 0) {
        applyBusinessTypeSelection(seededBusinessTypes, updates)
      } else {
        updateFormData(updates)
      }
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
    [
      applyBusinessTypeSelection,
      businessTypes,
      country,
      setField,
      updateFormData,
      seedStageFromFoundingYearIfDefault,
    ]
  )

  const handleClearCompany = useCallback(() => {
    setSelectedCompany(null)
    setCompanySearchValue('')
    updateFormData(buildCompanyCardClearPatch())
  }, [updateFormData])

  const handleBusinessTypeSelectionChange = useCallback(
    (_ids: string[], selectedBusinessTypes: ApiBusinessType[]) => {
      applyBusinessTypeSelection(selectedBusinessTypes)
    },
    [applyBusinessTypeSelection]
  )

  const updateSegmentEarnings = useCallback(
    (index: number, earnings: string) => {
      const nextSegments = updateSegmentEarningsValue(businessTypeSegments, index, earnings)
      updateFormData({ business_type_segments: nextSegments })
    },
    [businessTypeSegments, updateFormData]
  )

  const updateSegmentWeight = useCallback(
    (index: number, weight: string) => {
      const nextSegments = updateSegmentWeightValue(businessTypeSegments, index, weight)
      updateFormData({ business_type_segments: nextSegments })
    },
    [businessTypeSegments, updateFormData]
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

        <BusinessTypeSelector
          label={t('businessType')}
          value={selectedBusinessTypeIds}
          onChange={() => undefined}
          onSelectionChange={handleBusinessTypeSelectionChange}
          selectionMode="multiple"
          showPreview={selectedBusinessTypeIds.length <= 1}
        />

        {businessTypeSegments.length > 1 && (
          <div className="rounded-xl border border-foreground/[0.10] bg-foreground/[0.03] p-3">
            <div className="mb-2 text-xs font-semibold text-foreground">Segment weighting</div>
            <div className="space-y-3">
              {businessTypeSegments.map((segment, index) => {
                const basis = segment.basis ?? segment.earnings_basis
                const multiple =
                  typeof segment.multiple === 'number' || typeof segment.multiple === 'string'
                    ? segment.multiple
                    : segment.applied_multiple
                const multipleNumber = Number(multiple)
                const weightValue =
                  segment.weight != null
                    ? segment.weight
                    : Number((100 / businessTypeSegments.length).toFixed(2))

                return (
                  <div
                    key={`${segment.business_type_id}-${index}`}
                    className="grid gap-3 border-t border-foreground/[0.08] pt-3 md:grid-cols-[minmax(0,1fr)_120px_180px]"
                  >
                    <div className="min-w-0 self-center">
                      <div className="truncate text-sm font-medium text-foreground">
                        {segment.business_type_title ?? segment.business_type_id}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-foreground/60">
                        {basis && (
                          <span className="rounded-md bg-foreground/[0.06] px-2 py-1">{basis}</span>
                        )}
                        {Number.isFinite(multipleNumber) && (
                          <span className="rounded-md bg-foreground/[0.06] px-2 py-1">
                            {multipleNumber.toFixed(1)}x
                          </span>
                        )}
                      </div>
                    </div>
                    <AuroraNumberInput
                      label="Weight"
                      placeholder="Auto"
                      name={`business_type_segments.${index}.weight`}
                      value={weightValue}
                      onChange={(event) => updateSegmentWeight(index, event.target.value)}
                      min={0}
                      max={100}
                      step={5}
                      suffix="%"
                      allowDecimals
                    />
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
          label={t('legalForm')}
          options={getLegalFormOptions(country)}
          value={legalForm}
          onChange={(val) => {
            const nextLegalForm = String(val)
            updateFormData({
              legal_form: nextLegalForm,
              ...buildBusinessStructurePatch(nextLegalForm),
            })
          }}
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
                mrr: formatMaterialRevenueNudgeMrr({ mrr, arr }),
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
        <CompanySectorChip
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
