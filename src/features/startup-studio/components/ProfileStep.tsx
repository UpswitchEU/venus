'use client'

/**
 * Step 0 — Profile.
 *
 * Stage segmented control + sector + country + raise amount + company
 * name + a free-text one-liner. Drives smart defaults for the rest of
 * the wizard (the Athena benchmark is keyed on stage × sector × country)
 * AND bridges identity fields (`company_name`, `country_code`) into
 * `useManualFormStore` so the downstream `/reports/[id]` page can run
 * the calculation immediately without re-asking the founder.
 *
 * The bridge is a one-way write: Studio store → form store. The form
 * store is read only at submit time by `buildManualValuationRequest`, so
 * we never have to listen for back-pressure here.
 */

import { useCallback, useEffect, useRef } from 'react'
import { AuroraInput, AuroraTextarea } from '@/design-system/components/Input'
import { AuroraSelect } from '@/design-system/components/Select'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { CurrencyInput } from '@/components/calculator/CurrencyInput'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import {
  type StartupSector,
  type StartupStage,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'

interface ProfileStepProps {
  locale?: 'en' | 'nl'
}

const STAGE_OPTIONS: { value: StartupStage; label: { en: string; nl: string } }[] = [
  { value: 'pre_seed', label: { en: 'Pre-seed', nl: 'Pre-seed' } },
  { value: 'seed', label: { en: 'Seed', nl: 'Seed' } },
  { value: 'series_a', label: { en: 'Series A', nl: 'Series A' } },
]

const SECTOR_OPTIONS: { value: StartupSector; label: { en: string; nl: string } }[] = [
  { value: 'saas', label: { en: 'SaaS', nl: 'SaaS' } },
  { value: 'marketplace', label: { en: 'Marketplace', nl: 'Marketplace' } },
  { value: 'fintech', label: { en: 'Fintech', nl: 'Fintech' } },
  { value: 'biotech_healthtech', label: { en: 'Biotech / Healthtech', nl: 'Biotech / Healthtech' } },
  { value: 'deeptech_ai', label: { en: 'Deeptech / AI', nl: 'Deeptech / AI' } },
  { value: 'consumer', label: { en: 'Consumer', nl: 'Consumer' } },
  { value: 'hardware', label: { en: 'Hardware', nl: 'Hardware' } },
  { value: 'other', label: { en: 'Other', nl: 'Andere' } },
]

const COUNTRY_OPTIONS = [
  { value: 'BE', label: { en: 'Belgium', nl: 'België' } },
  { value: 'NL', label: { en: 'Netherlands', nl: 'Nederland' } },
  { value: 'LU', label: { en: 'Luxembourg', nl: 'Luxemburg' } },
]

export function ProfileStep({ locale = 'en' }: ProfileStepProps) {
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const raise = useStartupValuationStore((s) => s.investment_amount_sought)
  const description = useStartupValuationStore((s) => s.description)
  const setField = useStartupValuationStore((s) => s.setField)

  // Form-store bridge: `buildStartupValuationRequest` reads `company_name`
  // and `country_code` from `useManualFormStore` (the identity fields
  // shared with the SME path). We surface a company-name input here so
  // the founder never lands on `/reports/[id]` with an empty form.
  const companyName = useManualFormStore((s) => s.formData.company_name ?? '')
  const updateFormData = useManualFormStore((s) => s.updateFormData)

  // Country bridge — only mirror when the founder actively changes the
  // country inside the Studio.  A `useEffect` that mirrors on every
  // render would silently clobber a country the user previously set in
  // a different surface (SME flow, Mercury KBO prefill) the moment they
  // open the Studio because the Studio store always defaults to ``BE``.
  // Triggering only inside the onChange handler keeps the bridge
  // intent-revealing and side-effect free.
  const handleCountryChange = useCallback(
    (next: string) => {
      const code = String(next)
      setField('country_code', code)
      updateFormData({ country_code: code })
    },
    [setField, updateFormData],
  )

  // Mercury KBO calculator → Studio handoff: when a founder lands here
  // via `?prefilledQuery=Acme%20Robotics`, seed the company-name field
  // exactly once.  Only prefill when the field is empty so we never
  // clobber a name the founder already typed (or one that was prefilled
  // by a previous KBO lookup and persisted in the form store).
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

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <p className="text-sm text-foreground/70">
          {locale === 'nl'
            ? 'Welkom bij de Startup Waarderingsmotor. Beantwoord 6 stappen — je live waardering verschijnt rechts terwijl je werkt.'
            : "Welcome to the Startup Valuation Studio. Answer 6 steps — your live valuation appears on the right as you go."}
        </p>
      </div>

      <div className="space-y-5 rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground/80">
            {locale === 'nl' ? 'Bedrijfsnaam' : 'Company name'}
          </label>
          <AuroraInput
            value={companyName}
            onChange={(e) =>
              updateFormData({ company_name: e.target.value.slice(0, 120) })
            }
            placeholder={locale === 'nl' ? 'Bv. Henchman' : 'e.g. Henchman'}
            maxLength={120}
            autoComplete="organization"
            required
            aria-required
          />
          <p className="mt-2 text-xs text-foreground/55">
            {locale === 'nl'
              ? 'Verschijnt op je investor-ready PDF rapport.'
              : 'Shows up on your investor-ready PDF report.'}
          </p>
        </div>

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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground/80">
              {locale === 'nl' ? 'Sector' : 'Sector'}
            </label>
            <AuroraSelect
              options={SECTOR_OPTIONS.map((o) => ({ value: o.value, label: o.label[locale] }))}
              value={sector}
              onChange={(value) => setField('sector', value as StartupSector)}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground/80">
              {locale === 'nl' ? 'Land' : 'Country'}
            </label>
            <AuroraSelect
              options={COUNTRY_OPTIONS.map((o) => ({ value: o.value, label: o.label[locale] }))}
              value={country}
              onChange={(value) => handleCountryChange(String(value))}
            />
          </div>
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
              ? 'Bepaalt de cap-table simulator en de pre-money calculatie.'
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
