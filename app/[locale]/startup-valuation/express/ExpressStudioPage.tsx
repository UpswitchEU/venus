'use client'

/**
 * ExpressStudioPage — single-screen pre-seed valuation flow.
 *
 * Time-to-PDF target: 90 seconds.
 *
 * Layout:
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  Header                                                           │
 *   ├──────────────────────────┬───────────────────────────────────────┤
 *   │                          │                                        │
 *   │  PresetPicker            │   Live valuation receipt              │
 *   │  ─────────────           │   ─────────────────────                │
 *   │  Compact form            │   - Headline pre/post/dilution         │
 *   │  - Company name          │   - Football field per leg             │
 *   │  - Stage / sector / land │   - Pedigree chip                       │
 *   │  - Raise amount          │   - Methodology footnote               │
 *   │  - Founder pedigree      │                                        │
 *   │  - Year-5 ARR            │   ─────────────────                    │
 *   │  - Exit multiple         │   ⚡ Generate PDF report               │
 *   │  - Target ROI            │                                        │
 *   │                          │   PDF status / download link            │
 *   └──────────────────────────┴───────────────────────────────────────┘
 *
 * The form is the entire wizard collapsed into one column.  The
 * `applyPreset` action fills 30+ fields in one click, and the `Generate`
 * button triggers the canonical `valuationService.calculateValuation`
 * → `/api/valuations/{id}/pdf` pipeline so the PDF that drops out is
 * byte-identical to what the 8-step wizard produces.
 *
 * Why a separate page (vs collapsing the wizard): the wizard's per-step
 * blocker logic + analytics events are valuable for a guided learning
 * UX.  The Express path optimises for *speed* (deck-ready PDF in 90s)
 * for founders who already know what they need.
 */

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronDown, Download, FileText, Loader2, Sparkles, Wand2 } from 'lucide-react'
import { AuroraButton } from '@/design-system/components/Button'
import { AuroraInput, AuroraTextarea } from '@/design-system/components/Input'
import { AuroraSelect } from '@/design-system/components/Select'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { CurrencyInput } from '@/components/calculator/CurrencyInput'
import { AdaptivePercentInput } from '@/components/calculator/sections/AdaptivePercentInput'
import { CompanyNameInput } from '@/components/forms/CompanyNameInput'
import type { CompanySearchResult } from '@/services/registry/types'
import { naceBusinessTypeService } from '@/services/naceBusinessTypeService'
import { mapLegalFormToBusinessStructure } from '@/utils/legalFormMapping'
import { AmbitionPicker } from '@/features/startup-studio/components/AmbitionPicker'
import { InceptionLensPicker } from '@/features/startup-studio/components/InceptionLensPicker'
import { TeamPicker } from '@/features/startup-studio/components/TeamPicker'
import { TransparencyPanel } from '@/features/startup-studio/components/TransparencyPanel'
import { getAmbitionAnchors } from '@/features/startup-studio/data/ambition'
import { LiveReceipt } from '@/features/startup-studio/components/LiveReceipt'
import { PresetPicker } from '@/features/startup-studio/components/PresetPicker'
import {
  formatEur,
  useLiveValuation,
} from '@/features/startup-studio/hooks/useLiveValuation'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import {
  PEDIGREE_DELTA_PCT,
  PEDIGREE_KEYS,
  type FounderPedigreeKey,
  type StartupSector,
  type StartupStage,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import { buildStartupValuationRequest } from '@/utils/buildStartupValuationRequest'
import { valuationService } from '@/services/valuation/ValuationService'
import { generateReportId } from '@/utils/reportIdGenerator'
import { generalLogger } from '@/utils/logger'
import { cn } from '@/lib/utils'

interface Props {
  locale: 'en' | 'nl'
}

type GenStatus =
  | { phase: 'idle' }
  | { phase: 'calculating'; progress: number }
  | { phase: 'pdf-generating'; progress: number; reportId: string }
  | { phase: 'ready'; reportId: string; pdfUrl: string | null; valuationId: string }
  | { phase: 'error'; message: string }

const STAGE_OPTIONS: Array<{ value: StartupStage; label: { en: string; nl: string } }> = [
  { value: 'pre_seed', label: { en: 'Pre-seed', nl: 'Pre-seed' } },
  { value: 'seed', label: { en: 'Seed', nl: 'Seed' } },
  { value: 'series_a', label: { en: 'Series A', nl: 'Series A' } },
]

const SECTOR_OPTIONS: Array<{ value: StartupSector; label: { en: string; nl: string } }> = [
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

const PEDIGREE_LABELS: Record<FounderPedigreeKey, { en: string; nl: string }> = {
  prior_exit: { en: 'Prior venture-backed exit (≥€10M)', nl: 'Eerdere venture-backed exit (≥€10M)' },
  top_unicorn_alumnus: {
    en: 'Top-tier scaleup alumnus (Adyen / Collibra / Showpad / …)',
    nl: 'Senior alumnus topscaleup (Adyen / Collibra / Showpad / …)',
  },
  domain_expert_10y: {
    en: '10+ years industry experience (founder-market fit)',
    nl: '10+ jaar branche-ervaring (founder-market fit)',
  },
  second_time_founder: { en: 'Second-time founder (prior 2y+ venture)', nl: 'Tweede keer oprichter (eerdere 2j+ venture)' },
  has_technical_cofounder: { en: 'Full-time technical cofounder', nl: 'Voltijdse technische medeoprichter' },
  solo_founder: { en: 'Solo founder (no cofounders)', nl: 'Solo-oprichter (geen medeoprichters)' },
}

function formatPedigreeDelta(delta: number): string {
  const sign = delta > 0 ? '+' : '−'
  return `${sign}${Math.abs(delta).toFixed(2)}×`
}

export function ExpressStudioPage({ locale }: Props) {
  const router = useRouter()

  // Studio store (canonical inputs)
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const investment = useStartupValuationStore((s) => s.investment_amount_sought)
  const y5 = useStartupValuationStore((s) => s.year5_revenue_projection)
  const exitMultiple = useStartupValuationStore((s) => s.exit_revenue_multiple)
  const targetRoi = useStartupValuationStore((s) => s.target_roi_x)
  const pedigree = useStartupValuationStore((s) => s.founder_pedigree)
  const setField = useStartupValuationStore((s) => s.setField)
  const setPedigreeFlag = useStartupValuationStore((s) => s.setPedigreeFlag)
  const toRequestPayload = useStartupValuationStore((s) => s.toRequestPayload)

  // Manual form store (company name lives here — bridge contract)
  const companyName = useManualFormStore((s) => s.formData.company_name ?? '')
  const updateFormData = useManualFormStore((s) => s.updateFormData)

  // Live receipt
  const { benchmark, isFallback, publishedAt } = useStartupBenchmark(country, stage, sector)
  const valuation = useLiveValuation(benchmark)

  // Generation lifecycle
  const [status, setStatus] = useState<GenStatus>({ phase: 'idle' })

  // ── Derived headline numbers (also shown in the live receipt) ────────
  const blendedMid = valuation.blended?.mid ?? null
  const postMoney = blendedMid != null && investment ? blendedMid + investment : null
  const dilutionPct =
    blendedMid != null && investment && postMoney != null && postMoney > 0
      ? (investment / postMoney) * 100
      : null

  // ── Form helpers ─────────────────────────────────────────────────────
  const setSector = useCallback(
    (next: string) => setField('sector', next as StartupSector),
    [setField],
  )
  const setStage = useCallback(
    (next: string) => setField('stage', next as StartupStage),
    [setField],
  )
  const setCountry = useCallback(
    (next: string) => setField('country_code', String(next)),
    [setField],
  )
  const setInvestment = useCallback(
    (next: number | undefined) => setField('investment_amount_sought', next ?? null),
    [setField],
  )
  const setY5 = useCallback(
    (next: number | undefined) => setField('year5_revenue_projection', next ?? null),
    [setField],
  )
  const setExit = useCallback(
    (next: number | undefined) => setField('exit_revenue_multiple', next ?? null),
    [setField],
  )
  const setRoi = useCallback(
    (next: number | undefined) => setField('target_roi_x', next ?? null),
    [setField],
  )

  // Free-text pitch lives on the Studio store (it's already wired into the
  // request payload as `studio_v2.description`).  Surfacing it here lets the
  // founder describe their company in their own words — that copy ends up
  // verbatim on the PDF report and gives investors something a slider can't.
  const description = useStartupValuationStore((s) => s.description)
  const setDescription = useCallback(
    (next: string) => setField('description', next.slice(0, 600)),
    [setField],
  )

  // ── KBO/KVK registry lookup — mirrors ManualInputPanel.handleCompanySelect.
  // The same canonical autofill chain so a founder picking from the Express
  // dropdown ends up with byte-identical store state to one going through
  // the long-form ManualLayout: company name + KBO + legal form + NACE
  // (canonical + display) + business type + industry, plus our Studio-only
  // sector inference via `seedSectorFromNaceIfDefault`.
  const seedSectorFromNace = useStartupValuationStore(
    (s) => s.seedSectorFromNaceIfDefault,
  )
  const [selectedCompany, setSelectedCompany] = useState<CompanySearchResult | null>(
    null,
  )
  const naceLookupAbortRef = useRef<AbortController | null>(null)

  const handleCompanySelected = useCallback(
    async (company: CompanySearchResult | null) => {
      // Cancel any in-flight NACE lookups so a rapid re-selection doesn't
      // race the previous one to the store.
      if (naceLookupAbortRef.current) naceLookupAbortRef.current.abort()
      setSelectedCompany(company)
      if (!company) {
        // User cleared selection — wipe the registry-sourced fields but
        // leave the typed company name alone (the user is mid-edit).
        updateFormData({
          kbo_number: '',
          legal_form: '',
          nace_code: '',
          nace_description: '',
          business_type_id: undefined,
        })
        return
      }

      const canonical =
        (company.canonical_nace_code ?? company.nace_code ?? '').trim() || ''
      const displayCode = (company.activity_code ?? company.nace_code ?? '').trim()

      // Compose a single address line if KBO returned the parts.
      // Mirrors ManualInputPanel.handleCompanySelect's address builder so
      // the canonical PDF report shows the registry-resolved address
      // exactly the same way the long-form ManualLayout does.
      const addr = (company.address ?? '').trim()
      const postal = (company.postal_code ?? '').trim()
      const city = (company.city ?? '').trim()
      const composedAddress =
        postal && addr && !addr.includes(postal)
          ? `${addr}, ${postal} ${city}`.trim()
          : addr

      // Single canonical update — mirrors `ManualInputPanel.handleCompanySelect`.
      // Keys map directly to Titan/ValuationIQ payload field names so the
      // engine receives exactly what the long-form ManualLayout would send.
      updateFormData({
        company_name: company.company_name ?? '',
        country_code: company.country_code ?? undefined,
        kbo_number: company.kbo_number ?? company.registration_number ?? '',
        legal_form: company.legal_form ?? '',
        nace_code: canonical,
        nace_description: company.nace_description ?? '',
        ...(displayCode && canonical && displayCode !== canonical
          ? { activity_code: displayCode }
          : {}),
        ...(company.business_type_id ? { business_type_id: company.business_type_id } : {}),
        ...(company.business_type_title
          ? { industry: company.business_type_title.toLowerCase() }
          : {}),
        // Address fields — registry-resolved so the canonical ValuationIQ
        // PDF can render the exact address the founder would expect to
        // see on a Cap Table or term sheet.
        ...(composedAddress ? { address: composedAddress } : {}),
        ...(postal ? { postal_code: postal } : {}),
        ...(city ? { city } : {}),
        // Business structure — derived from legal_form via the same
        // canonical mapper ManualInputPanel uses.  Keeps the SME and
        // startup paths bit-for-bit consistent on the field that drives
        // tax structure framing in the PDF.
        ...(company.legal_form
          ? { business_structure: mapLegalFormToBusinessStructure(company.legal_form) }
          : {}),
      } as Record<string, unknown>)

      // Mirror country into the Studio store so the live receipt's
      // benchmark band, the AmbitionPicker's anchors, and the engine
      // request all reflect the registry-resolved country.
      if (company.country_code) {
        setField('country_code', String(company.country_code).toUpperCase())
      }

      // Sector inference — fires only when the user hasn't explicitly
      // picked a sector yet (Studio guards via `_sectorWasUserSet`).
      if (canonical) {
        seedSectorFromNace(canonical)
      }

      // Fast path: Titan resolved the business type server-side.  Done.
      if (company.business_type_id) return

      // Fallback: hit the NACE → business_type service so the engine
      // still gets a categorised industry on Express founders coming
      // from a registry that didn't seed `business_type_id`.
      if (canonical) {
        const controller = new AbortController()
        naceLookupAbortRef.current = controller
        try {
          const bt = await naceBusinessTypeService.getBusinessTypeForNaceCode(
            canonical,
            controller.signal,
            company.country_code || undefined,
          )
          if (controller.signal.aborted) return
          if (bt) {
            updateFormData({
              business_type_id: bt.id,
              industry: bt.category || 'services',
            })
          }
        } catch (err) {
          if (!(err instanceof DOMException && err.name === 'AbortError')) {
            generalLogger.warn('[Express] NACE→business-type lookup failed', { err })
          }
        } finally {
          if (naceLookupAbortRef.current === controller) {
            naceLookupAbortRef.current = null
          }
        }
      }
    },
    [seedSectorFromNace, setField, updateFormData],
  )

  // Email capture — required for the Wintercircus PLG flow ("KBO + email
  // → free registered user → report on dashboard").  Threaded into the
  // canonical request via `metadata.email`; ValuationIQ ignores it for
  // the math but Titan persists it on the session record so the founder
  // can be resolved against the Mercury auth model later.
  const founderEmail = useManualFormStore(
    (s) => (s.formData as { email?: string }).email ?? '',
  )
  const setFounderEmail = useCallback(
    (next: string) => updateFormData({ email: next.slice(0, 240) } as Record<string, unknown>),
    [updateFormData],
  )

  // ── The big "Generate" button ────────────────────────────────────────
  //
  // 1. Build the canonical Titan/ValuationIQ payload (same builder as the
  //    8-step wizard uses post-submit).
  // 2. POST through valuationService → backend computes the engine result.
  // 3. POST `/api/valuations/{id}/pdf` to kick off Puppeteer PDF render.
  // 4. Surface the download URL inline (and a "View full report" link
  //    that drops the user into the canonical /reports/[id] page).
  const isGenerating =
    status.phase === 'calculating' || status.phase === 'pdf-generating'

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return
    if (!companyName.trim()) {
      setStatus({
        phase: 'error',
        message:
          locale === 'nl'
            ? 'Geef je bedrijfsnaam op voor we het rapport kunnen genereren.'
            : 'Add a company name before we generate the report.',
      })
      return
    }

    setStatus({ phase: 'calculating', progress: 10 })

    // Reserve a stable report id up front so the URL can be built before
    // the calc finishes — keeps the "View full report" link working
    // even if the PDF endpoint is slow.
    const reportId = generateReportId()

    try {
      const startupInputs = toRequestPayload()
      // Pull KBO/KVK-resolved fields off the form store so the canonical
      // Titan request inherits everything the registry autofill chain
      // produced — no founder retyping.
      const formSnap = useManualFormStore.getState().formData as {
        kbo_number?: string
        legal_form?: string
        nace_code?: string
        nace_description?: string
        business_type_id?: string
        industry?: string
        business_model?: string
        founding_year?: number
        email?: string
      }
      const request = buildStartupValuationRequest({
        companyName,
        countryCode: country,
        startupInputs,
        locale,
        ...(formSnap.industry ? { industry: formSnap.industry } : {}),
        ...(formSnap.business_model ? { businessModel: formSnap.business_model } : {}),
        ...(formSnap.founding_year ? { foundingYear: formSnap.founding_year } : {}),
        ...(formSnap.nace_code ? { naceCode: formSnap.nace_code } : {}),
        ...(formSnap.nace_description
          ? { naceDescription: formSnap.nace_description }
          : {}),
        ...(formSnap.business_type_id
          ? { businessTypeId: formSnap.business_type_id }
          : {}),
      })
      // Tag the request with the reservation id so the backend session
      // record links to the same id we'll point the PDF endpoint at.
      ;(request as unknown as Record<string, unknown>).reportId = reportId
      // Thread the founder email + KBO into the canonical metadata so
      // Titan persists them on the session record (Wintercircus PLG
      // flywheel: KBO + email = registered free user).  ValuationIQ
      // ignores both — they don't influence the engine math.
      const meta = (request.metadata ?? {}) as Record<string, unknown>
      if (formSnap.email && formSnap.email.trim()) {
        meta.founder_email = formSnap.email.trim()
      }
      if (formSnap.kbo_number && formSnap.kbo_number.trim()) {
        meta.kbo_number = formSnap.kbo_number.trim()
      }
      ;(request as { metadata?: Record<string, unknown> }).metadata = meta

      const response = await valuationService.calculateValuation(request, (p) =>
        setStatus({ phase: 'calculating', progress: Math.max(10, Math.min(85, p)) }),
      )

      const valuationId =
        (response as unknown as { valuation_id?: string }).valuation_id ?? reportId

      setStatus({
        phase: 'pdf-generating',
        progress: 90,
        reportId: valuationId,
      })

      // Kick off the canonical server-side PDF render.  The endpoint may
      // return either {pdfUrl} synchronously (cached) or {jobId} (async);
      // we handle both — for async we surface the in-progress state and
      // the founder can click "View full report" to land on the polling
      // UI in /reports/[id] that the rest of the app already implements.
      let pdfUrl: string | null = null
      try {
        const pdfResp = await fetch(`/api/valuations/${valuationId}/pdf`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        })
        if (pdfResp.ok) {
          const data = (await pdfResp.json().catch(() => ({}))) as {
            pdfUrl?: string
            jobId?: string
          }
          pdfUrl = data.pdfUrl ?? null
        } else {
          generalLogger.warn('[Express] PDF kickoff failed', { status: pdfResp.status })
        }
      } catch (err) {
        generalLogger.warn('[Express] PDF kickoff threw', { err })
      }

      setStatus({
        phase: 'ready',
        reportId: valuationId,
        valuationId,
        pdfUrl,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? 'Unknown error')
      generalLogger.error('[Express] calculation failed', { err })
      setStatus({
        phase: 'error',
        message:
          locale === 'nl'
            ? `Berekening mislukt: ${message}. Probeer opnieuw of open de uitgebreide wizard.`
            : `Calculation failed: ${message}. Retry or open the detailed wizard.`,
      })
    }
  }, [companyName, country, isGenerating, locale, toRequestPayload])

  // ── Time-to-PDF telemetry (for the "1-2 minute" KPI) ────────────────
  const [startedAt] = useState(() => Date.now())
  const elapsedMinutes =
    status.phase === 'ready' ? Math.max(1, Math.round((Date.now() - startedAt) / 60_000)) : null

  // Auto-open detailed wizard URL if the ?wizard=1 escape param is set
  // (lets us fall back to the 8-step flow for QA / partners that want
  // the guided UX).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('wizard') === '1') {
      router.replace(`/${locale}/startup-valuation`)
    }
  }, [locale, router])

  // No-friction default — if the founder lands without preset OR ambition
  // having filled the VC inputs, apply the *standard* ambition anchor for
  // the current sector.  This guarantees the VC leg of the engine never
  // silently drops out and the live receipt always shows a number on
  // first paint, even for a brand-new visitor who hasn't clicked
  // anything yet.  Runs once on mount + whenever sector changes (so the
  // numbers track the sector pick).
  useEffect(() => {
    if (y5 == null && exitMultiple == null && targetRoi == null) {
      const anchors = getAmbitionAnchors(sector, 'standard')
      setField('year5_revenue_projection', anchors.year5_revenue)
      setField('exit_revenue_multiple', anchors.exit_revenue_multiple)
      setField('target_roi_x', anchors.target_roi_x)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sector])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/[0.02]">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8">
        {/* Header */}
        <header className="mb-6">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
            <Wand2 className="h-3.5 w-3.5" />
            {locale === 'nl' ? 'Express waardering' : 'Express valuation'}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground lg:text-3xl">
            {locale === 'nl'
              ? 'Pre-seed waardering · investor-ready PDF in 90 seconden'
              : 'Pre-seed valuation · investor-ready PDF in 90 seconds'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65">
            {locale === 'nl' ? (
              <>
                Eén scherm. Kies een template, bevestig je inputs, druk op{' '}
                <span className="font-medium text-foreground">Genereer rapport</span>.
                Aangedreven door <span className="font-medium text-foreground">ValuationIQ</span> —
                Berkus + Scorecard + VC + SaaS Forward + founder-pedigree multiplier, Q1 2026
                Benelux benchmarks.
              </>
            ) : (
              <>
                One screen. Pick a template, confirm your inputs, press{' '}
                <span className="font-medium text-foreground">Generate report</span>.
                Powered by <span className="font-medium text-foreground">ValuationIQ</span> —
                Berkus + Scorecard + VC + SaaS Forward + founder-pedigree multiplier, Q1 2026
                Benelux benchmarks.
              </>
            )}
          </p>
        </header>

        {/* Two-column body */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {/* ─── LEFT: form + preset picker ─────────────────────────── */}
          <main className="space-y-5">
            <PresetPicker locale={locale} />

            {/* Identity --------------------------------------------- */}
            <section className="space-y-4 rounded-2xl border border-foreground/10 bg-background/60 p-6">
              <h2 className="text-sm font-semibold text-foreground">
                {locale === 'nl' ? 'Identiteit' : 'Identity'}
              </h2>

              {/* KBO/KVK-aware company-name input — same registry-search
                  primitive ManualLayout uses (`CompanyNameInput`).  Type
                  the company name, pick from the live KBO/BE or KVK/NL
                  dropdown, and the autofill chain populates country,
                  legal form, NACE code, business type and sector
                  inference in one shot.  No guesswork for any owner who
                  has a registered Benelux company. */}
              <div>
                <CompanyNameInput
                  label={locale === 'nl' ? 'Bedrijfsnaam' : 'Company name'}
                  value={companyName}
                  onChange={(next) =>
                    updateFormData({ company_name: next.slice(0, 120) })
                  }
                  countryCode={country}
                  selectedCompany={selectedCompany}
                  onCompanyChange={handleCompanySelected}
                  onClearCompany={() => handleCompanySelected(null)}
                  placeholder={locale === 'nl' ? 'Bv. Upswitch' : 'e.g. Upswitch'}
                  required
                  autoComplete="organization"
                />
                {selectedCompany && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                    <Sparkles className="h-3 w-3" />
                    {locale === 'nl'
                      ? `Auto-prefill via ${country === 'NL' ? 'KVK' : 'KBO'}: sector, NACE-code, rechtsvorm en bedrijfstype zijn ingevuld.`
                      : `Auto-prefilled via ${country === 'NL' ? 'KVK' : 'KBO'}: sector, NACE code, legal form and business type are set.`}
                  </p>
                )}
              </div>

              {/* Founder email — captured for the canonical Titan
                  session record so the PLG flywheel can resolve a free
                  user against the Mercury auth model.  ValuationIQ
                  ignores this for the math; Titan persists it. */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground/70">
                  {locale === 'nl' ? 'E-mail' : 'Email'}
                </label>
                <AuroraInput
                  type="email"
                  value={founderEmail}
                  onChange={(e) => setFounderEmail(e.target.value)}
                  placeholder={
                    locale === 'nl' ? 'jij@bedrijf.com' : 'you@company.com'
                  }
                  autoComplete="email"
                  inputMode="email"
                />
                <p className="mt-1.5 text-[11px] text-foreground/55">
                  {locale === 'nl'
                    ? 'We sturen je rapport hierheen — en het komt op je dashboard.'
                    : 'We send your report here — and it lands in your dashboard.'}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground/70">
                  {locale === 'nl' ? 'Beschrijf je bedrijf in 1–2 zinnen' : 'Describe your company in 1–2 sentences'}
                </label>
                <AuroraTextarea
                  value={description ?? ''}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={600}
                  placeholder={
                    locale === 'nl'
                      ? 'Bv. Tweezijdige marktplaats voor Benelux KMO-overdracht. Live KBO/KVK integratie, AI-waardering, accountancy partnerschappen.'
                      : 'e.g. Two-sided marketplace for Benelux SME succession. Live KBO/KVK registry, AI-powered valuation, accountancy partnerships.'
                  }
                />
                <p className="mt-1.5 text-[11px] text-foreground/55">
                  {locale === 'nl'
                    ? 'Verschijnt op je investor-PDF — investeerders willen één zin die je idee ophelderen.'
                    : 'Shows up on your investor PDF — investors want one sentence that explains the idea.'}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground/70">
                    {locale === 'nl' ? 'Stage' : 'Stage'}
                  </label>
                  <SegmentedControl
                    options={STAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label[locale] }))}
                    value={stage}
                    onChange={setStage}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground/70">
                    {locale === 'nl' ? 'Sector' : 'Sector'}
                  </label>
                  <AuroraSelect
                    options={SECTOR_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label[locale],
                    }))}
                    value={sector}
                    onChange={setSector}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground/70">
                    {locale === 'nl' ? 'Land' : 'Country'}
                  </label>
                  <AuroraSelect
                    options={COUNTRY_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label[locale],
                    }))}
                    value={country}
                    onChange={setCountry}
                  />
                </div>
              </div>
            </section>

            {/* The round ------------------------------------------- */}
            <section className="space-y-4 rounded-2xl border border-foreground/10 bg-background/60 p-6">
              <h2 className="text-sm font-semibold text-foreground">
                {locale === 'nl' ? 'De ronde' : 'The round'}
              </h2>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground/70">
                  {locale === 'nl' ? 'Op te halen bedrag (€)' : 'Round size (€)'}
                </label>
                <CurrencyInput
                  value={investment ?? undefined}
                  onChange={setInvestment}
                  placeholder="1.500.000"
                />
                {/* Stage-based anchoring — gives the founder a real number
                    to react to instead of a blank field.  Atomico SoEU
                    2024 + Dealroom Benelux Q1 2026 medians per stage. */}
                <p className="mt-1.5 text-[11px] text-foreground/55">
                  {(() => {
                    const STAGE_HINT: Record<StartupStage, { en: string; nl: string }> = {
                      pre_seed: {
                        en: 'Typical Benelux pre-seed: €500k – €1.5M',
                        nl: 'Typisch Benelux pre-seed: €500k – €1.5M',
                      },
                      seed: {
                        en: 'Typical Benelux seed: €1M – €3M',
                        nl: 'Typisch Benelux seed: €1M – €3M',
                      },
                      series_a: {
                        en: 'Typical Benelux Series A: €3M – €10M',
                        nl: 'Typisch Benelux Series A: €3M – €10M',
                      },
                    }
                    return STAGE_HINT[stage][locale]
                  })()}
                </p>
              </div>
            </section>

            {/* Team picker — single 4-bucket plain-language replacement
                for the 6 founder-pedigree checkboxes.  An owner picks ONE
                card in 5 seconds; the engine still receives the same flag
                set under the hood.  The 6 explicit flags remain visible
                inside the Advanced disclosure for advisors / auditors. */}
            <TeamPicker locale={locale} />

            {/* Ambition picker — replaces VC-method technical inputs.
                The engine still consumes Y5 / exit / ROI; the founder
                just never has to know what those words mean. */}
            <AmbitionPicker locale={locale} />

            {/* Inception lens — opt-in overlay for founders who aren't
                on a conventional milestone path.  Acknowledges that pre-
                seed is won by momentum (not moats) and that the best
                founders cost more.  Default is no-op so milestone-track
                founders see no behaviour change. */}
            <InceptionLensPicker locale={locale} />

            {/* Advanced disclosure — for advisors / auditors who want
                per-claim provenance and fine-grained engine controls.
                Collapsed by default so the Express form stays no-brainer
                for owners.  Native <details> for keyboard + screen-reader
                accessibility out of the box. */}
            <details className="group rounded-2xl border border-foreground/10 bg-background/40">
              <summary className="flex cursor-pointer items-center justify-between gap-2 px-6 py-4 text-sm font-medium text-foreground/70 hover:text-foreground">
                <span className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-foreground/45" />
                  {locale === 'nl'
                    ? 'Geavanceerd — voor adviseurs (optioneel, sla over)'
                    : 'Advanced — for advisors (optional, skip)'}
                </span>
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-6 border-t border-foreground/10 px-6 py-5">
                {/* Per-claim founder pedigree ------------------------ */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/65">
                    {locale === 'nl' ? 'Founder-pedigree per claim' : 'Founder pedigree per claim'}
                  </h3>
                  <p className="mt-1 text-xs text-foreground/55">
                    {locale === 'nl'
                      ? 'Wordt automatisch ingevuld door de team-keuze hierboven. Pas alleen aan als je een specifieke claim wilt toevoegen of verwijderen.'
                      : 'Auto-filled by the team picker above. Only edit if you need to add or remove a specific claim.'}
                  </p>
                  <div className="mt-3 grid gap-2">
                    {PEDIGREE_KEYS.map((key) => {
                      const checked = pedigree[key]
                      const delta = PEDIGREE_DELTA_PCT[key]
                      const isPenalty = delta < 0
                      return (
                        <label
                          key={key}
                          className={cn(
                            'flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-2.5 transition-all',
                            checked
                              ? isPenalty
                                ? 'border-amber-400 bg-amber-500/5'
                                : 'border-primary bg-primary/5'
                              : 'border-foreground/10 bg-background/40 hover:border-primary/40',
                          )}
                        >
                          <div className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => setPedigreeFlag(key, e.target.checked)}
                              className="mt-0.5 h-4 w-4 cursor-pointer rounded border-foreground/30 accent-primary"
                            />
                            <span className="text-xs text-foreground/85">
                              {PEDIGREE_LABELS[key][locale]}
                            </span>
                          </div>
                          <span
                            className={cn(
                              'shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold tabular-nums',
                              isPenalty
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                            )}
                          >
                            {formatPedigreeDelta(delta)}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* Per-anchor VC method --------------------------- */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/65">
                    {locale === 'nl' ? 'VC-methode anker' : 'VC method anchor'}
                  </h3>
                  <p className="mt-1 text-xs text-foreground/55">
                    {locale === 'nl'
                      ? 'Pre-money = (Y5 omzet × exit-multiple ÷ target ROI) − ronde-grootte. Wordt ingevuld door je ambitie-keuze hierboven.'
                      : 'Pre-money = (Y5 revenue × exit multiple ÷ target ROI) − round size. Filled by the ambition picker above.'}
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-foreground/70">
                        {locale === 'nl' ? 'Y5 omzet (€)' : 'Year-5 revenue (€)'}
                      </label>
                      <CurrencyInput
                        value={y5 ?? undefined}
                        onChange={setY5}
                        placeholder="10.000.000"
                      />
                    </div>
                    <div>
                      <AdaptivePercentInput
                        label={locale === 'nl' ? 'Exit-multiple (×)' : 'Exit multiple (×)'}
                        value={exitMultiple ?? undefined}
                        onChange={setExit}
                        placeholder="5"
                      />
                    </div>
                    <div>
                      <AdaptivePercentInput
                        label={locale === 'nl' ? 'Target ROI (×)' : 'Target ROI (×)'}
                        value={targetRoi ?? undefined}
                        onChange={setRoi}
                        placeholder="15"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </details>

            {/* Footer link to detailed wizard --------------------- */}
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
              <p className="flex items-start gap-2 text-xs text-foreground/55">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {locale === 'nl' ? (
                    <>
                      Wil je elke leg apart finetunen? Ga naar de{' '}
                      <a
                        href={`/${locale}/startup-valuation`}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        uitgebreide wizard
                      </a>{' '}
                      met 8 stappen.
                    </>
                  ) : (
                    <>
                      Want to fine-tune each leg individually?  Open the{' '}
                      <a
                        href={`/${locale}/startup-valuation`}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        detailed 8-step wizard
                      </a>
                      .
                    </>
                  )}
                </span>
              </p>
            </div>
          </main>

          {/* ─── RIGHT: live receipt + Generate ────────────────────── */}
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <LiveReceipt
              valuation={valuation}
              benchmark={benchmark}
              isFallback={isFallback}
              publishedAt={publishedAt}
              locale={locale}
            />

            {/* Headline summary card — preview only.  The canonical
                pre-money / post-money / dilution numbers come back from
                ValuationIQ when the founder clicks Generate.  Labelled
                "preview" so a sceptical investor doesn't mistake this
                live-preview tile for the audit-ready report headline. */}
            {blendedMid != null && (
              <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.08] to-primary/[0.02] p-5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-primary">
                  {locale === 'nl' ? 'Live-preview · klaar voor je deck' : 'Live preview · ready for your deck'}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                      {locale === 'nl' ? 'Pre-money' : 'Pre-money'}
                    </p>
                    <p className="mt-0.5 text-base font-bold tabular-nums text-foreground">
                      {formatEur(blendedMid)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                      {locale === 'nl' ? 'Post-money' : 'Post-money'}
                    </p>
                    <p className="mt-0.5 text-base font-bold tabular-nums text-foreground">
                      {formatEur(postMoney)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                      {locale === 'nl' ? 'Dilutie' : 'Dilution'}
                    </p>
                    <p className="mt-0.5 text-base font-bold tabular-nums text-foreground">
                      {dilutionPct != null ? `${dilutionPct.toFixed(0)}%` : '—'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Generate CTA + status */}
            <div className="rounded-2xl border border-foreground/10 bg-background/80 p-5">
              <AuroraButton
                variant="primary"
                size="lg"
                onClick={handleGenerate}
                loading={isGenerating}
                disabled={isGenerating || !companyName.trim() || valuation.isEmpty}
                className="w-full justify-center gap-2"
              >
                {status.phase === 'calculating' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {locale === 'nl' ? 'Berekenen…' : 'Calculating…'}
                  </>
                ) : status.phase === 'pdf-generating' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {locale === 'nl' ? 'PDF genereren…' : 'Generating PDF…'}
                  </>
                ) : status.phase === 'ready' ? (
                  <>
                    <FileText className="h-4 w-4" />
                    {locale === 'nl' ? 'Opnieuw genereren' : 'Regenerate'}
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    {locale === 'nl' ? 'Genereer PDF rapport' : 'Generate PDF report'}
                  </>
                )}
              </AuroraButton>

              {status.phase === 'idle' && (
                <p className="mt-2 text-[11px] text-foreground/55">
                  {locale === 'nl'
                    ? 'Klik om de canonieke ValuationIQ pipeline te starten — engine + investor PDF.'
                    : 'Click to run the canonical ValuationIQ pipeline — engine + investor PDF.'}
                </p>
              )}

              {status.phase === 'error' && (
                <p
                  role="alert"
                  className="mt-2 rounded-lg border border-rose-300/60 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/40 dark:text-rose-300"
                >
                  {status.message}
                </p>
              )}

              {status.phase === 'ready' && (
                <div className="mt-3 space-y-2">
                  <p className="text-[11px] text-foreground/55">
                    {locale === 'nl'
                      ? `Klaar in ~${elapsedMinutes ?? 1} minuut.`
                      : `Done in ~${elapsedMinutes ?? 1} minute.`}
                  </p>
                  <div className="flex flex-col gap-2">
                    {status.pdfUrl && (
                      <a
                        href={status.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/[0.06] px-3 py-2 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/[0.10]"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {locale === 'nl' ? 'Download PDF rapport' : 'Download PDF report'}
                      </a>
                    )}
                    <a
                      href={`/${locale}/reports/${status.reportId}`}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm font-medium text-foreground/80 transition hover:border-primary hover:text-primary"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      {locale === 'nl' ? 'Open volledig rapport' : 'Open full report'}
                    </a>
                    {!status.pdfUrl && (
                      <p className="text-[11px] text-foreground/55">
                        {locale === 'nl'
                          ? 'PDF wordt op de achtergrond gerenderd — open het volledige rapport om te downloaden.'
                          : 'PDF is rendering in the background — open the full report to download.'}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Bain-grade transparency panel — sits below Generate so
                the founder hits the CTA first, then a sceptical investor
                or accountant can dig into "why this number" without
                derailing the founder's flow. */}
            <TransparencyPanel
              valuation={valuation}
              benchmark={benchmark}
              isFallback={isFallback}
              publishedAt={publishedAt}
              locale={locale}
            />
          </aside>
        </div>
      </div>
    </div>
  )
}
