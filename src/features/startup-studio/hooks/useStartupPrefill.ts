'use client'

/**
 * useStartupPrefill
 * -----------------
 *
 * Mirror of the SME `useBootstrapPrefill` for the startup_valuation
 * track.  Consumes Mercury's bootstrap context (KBO/KVK identity,
 * accountant-attached customer data, accounting integration metadata)
 * and seeds the Studio store + the canonical `useManualFormStore` so a
 * founder coming from the Sellability gate or a partner deep-link
 * never has to re-type identity that the platform already knows.
 *
 * What we prefill (in order of precedence):
 *
 *   1. **Identity** (always — ~80% of founder friction)
 *      - company_name + country_code + kbo_number + legal_form
 *        from `bootstrap.prefillData.kboData` / `companyInfo`
 *      - founding_year from `kboData.foundationDate`
 *      - business_type_id from `bootstrap.prefillData.businessType.id`
 *
 *   2. **Sector** (NACE-driven, falls back to the businessType category)
 *      - Studio sector enum is inferred from the canonical NACE code
 *        via `inferStartupSectorFromNace`. This is what the engine reads
 *        to pick exit multiples + sector benchmarks.
 *
 *   3. **Traction** (only when an accounting integration synced data)
 *      - mrr / arr from `bootstrap.prefillData.financials.saasMetrics`
 *        when the upstream Hermes derivation surfaced values. Skips
 *        silently when the integration didn't.
 *
 *   4. **Round size** from URL `?round_size=` deep-link (Mercury BFF
 *      threads this through partner CTAs — already in the cross-app
 *      contract). Validated as a positive finite number; clamped to
 *      €10k..€10M to drop obvious garbage.
 *
 * Everything is **idempotent** + **non-destructive**: each setField
 * call only fires when the target field is still empty (or default).
 * Returning users + manually-overridden values are never clobbered.
 *
 * Runs once per panel mount; the `prefilledRef` guards against double-
 * apply on remount or on the BootstrapProvider re-firing its initial
 * effect.
 */

import { useEffect, useRef } from 'react'
import { useBootstrapSafe } from '@/lib/bootstrap/BootstrapProvider'
import { inferStartupSectorFromNace } from '@/store/manual/inferStartupSectorFromNace'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import {
  type StartupSector,
  type StartupStage,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import { parseFoundingYear, parseRoundSize } from './useStartupPrefill.helpers'
import { markStartupPrefilled } from './useStartupPrefilledKeys'

const ROUND_SIZE_QUERY_KEY = 'round_size'

const VALID_STAGES: ReadonlySet<StartupStage> = new Set<StartupStage>([
  'pre_seed',
  'seed',
  'series_a',
])

/**
 * Idempotent prefill hook for the startup-valuation panel.  Mounted
 * once at the top of `StartupValuationPanel` so every section sees the
 * already-populated store state on first paint.
 */
export function useStartupPrefill(): void {
  const bootstrap = useBootstrapSafe()
  const setField = useStartupValuationStore((s) => s.setField)
  const updateFormData = useManualFormStore((s) => s.updateFormData)
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    if (!bootstrap) return
    // Wait until bootstrap has resolved at least one signal — without
    // this guard we'd no-op-then-pin on the first render and miss the
    // real payload arriving a tick later.
    const pf = bootstrap.prefillData
    const hasAnySignal =
      !!pf.companyInfo?.companyName?.trim() ||
      !!pf.kboData?.kboNumber ||
      !!pf.businessType?.id ||
      !!pf.financials?.saasMetrics ||
      (typeof window !== 'undefined' &&
        !!new URLSearchParams(window.location.search).get(ROUND_SIZE_QUERY_KEY))
    if (!hasAnySignal) return

    ranRef.current = true

    // ── 1. Identity ───────────────────────────────────────────────
    // Reach into the canonical SME form-store the same way every other
    // method does.  buildStartupValuationRequest reads from this store
    // for the company envelope, so the Studio store doesn't need to
    // duplicate identity fields.
    const currentForm = useManualFormStore.getState().formData as unknown as Record<string, unknown>
    const formPatch: Record<string, unknown> = {}
    const company = pf.companyInfo
    const kbo = pf.kboData

    // Track which keys we touch so PrefillBadge can render the
    // correct provenance variant in the UI without each input
    // re-deriving "is this still my pre-fill?" by value comparison.
    const touched: string[] = []

    const incomingName =
      (kbo?.companyName?.trim() || company?.companyName?.trim() || '') as string
    if (incomingName && !(currentForm.company_name as string | undefined)?.trim()) {
      formPatch.company_name = incomingName.slice(0, 120)
      touched.push('company_name')
    }

    const incomingCountry = (kbo?.countryCode || company?.countryCode || '').toUpperCase()
    if (incomingCountry && !currentForm.country_code) {
      formPatch.country_code = incomingCountry
      // Mirror into the Studio store so sector inference + benchmarks
      // pick the right region without waiting for the canonical sync.
      setField('country_code', incomingCountry)
      touched.push('country_code')
    }

    const incomingKbo = kbo?.kboNumber || company?.kboNumber
    if (incomingKbo && !currentForm.kbo_number) {
      formPatch.kbo_number = incomingKbo
      touched.push('kbo_number')
    }

    const incomingLegalForm = kbo?.legalForm || company?.legalForm
    if (incomingLegalForm && !currentForm.legal_form) {
      formPatch.legal_form = incomingLegalForm
      touched.push('legal_form')
    }

    const incomingNace = kbo?.naceCode || company?.naceCode
    if (incomingNace && !currentForm.nace_code) {
      formPatch.nace_code = incomingNace
      touched.push('nace_code')
    }

    const incomingNaceDesc = kbo?.naceDescription || company?.naceDescription
    if (incomingNaceDesc && !currentForm.nace_description) {
      formPatch.nace_description = incomingNaceDesc
    }

    // Founding year — from KBO foundationDate (ISO yyyy-mm-dd or yyyy).
    const foundingYear = parseFoundingYear(kbo?.foundationDate)
    if (foundingYear != null && !currentForm.founding_year) {
      formPatch.founding_year = foundingYear
      touched.push('founding_year')
    }

    // Business type — Titan-resolved id from the registry enrichment.
    const incomingBtId = pf.businessType?.id || kbo?.businessTypeId
    if (incomingBtId && !currentForm.business_type_id) {
      formPatch.business_type_id = incomingBtId
      touched.push('business_type_id')
      const incomingCategory = pf.businessType?.category
      if (incomingCategory && !currentForm.industry) {
        formPatch.industry = incomingCategory
      }
    }

    if (Object.keys(formPatch).length > 0) {
      updateFormData(formPatch)
    }
    if (touched.length > 0) {
      markStartupPrefilled(...touched)
    }

    // ── 2. Sector ─────────────────────────────────────────────────
    // The Studio sector drives exit multiples + sector benchmarks.
    // Only seed when we have a NACE we can map AND the user hasn't
    // already picked a non-default sector.  The seedSectorFromNaceIfDefault
    // helper enforces that guard.
    const studio = useStartupValuationStore.getState()
    const inferredSector: StartupSector | null = inferStartupSectorFromNace(incomingNace ?? null)
    if (inferredSector && studio.sector === 'other') {
      // Use the seed helper so the "_sectorWasUserSet" flag stays
      // honoured if the user later picks a different sector by hand.
      studio.seedSectorFromNaceIfDefault(incomingNace ?? null)
      markStartupPrefilled('sector')
    }

    // ── 3. Traction (accounting-integration data) ─────────────────
    // Hermes derives MRR/ARR from recurring-revenue ledger lines for
    // Yuki/Exact integrations. When present, the founder's traction
    // step lights up before they touch it.
    const sm = pf.financials?.saasMetrics
    if (sm && typeof sm === 'object') {
      const arrCandidate = (sm as { arr?: unknown }).arr
      if (
        typeof arrCandidate === 'number' &&
        Number.isFinite(arrCandidate) &&
        arrCandidate > 0 &&
        (studio.arr == null || studio.arr === 0)
      ) {
        setField('arr', arrCandidate)
        markStartupPrefilled('arr')
      }
      const mrrCandidate = (sm as { mrr?: unknown }).mrr
      if (
        typeof mrrCandidate === 'number' &&
        Number.isFinite(mrrCandidate) &&
        mrrCandidate > 0 &&
        (studio.mrr == null || studio.mrr === 0)
      ) {
        setField('mrr', mrrCandidate)
        markStartupPrefilled('mrr')
      }
    }

    // ── 4. Round size from URL deep-link ──────────────────────────
    if (typeof window !== 'undefined') {
      try {
        const raw = new URLSearchParams(window.location.search).get(ROUND_SIZE_QUERY_KEY)
        const roundSize = parseRoundSize(raw)
        if (roundSize != null && (studio.investment_amount_sought ?? 0) === 0) {
          setField('investment_amount_sought', roundSize)
          markStartupPrefilled('investment_amount_sought')
        }
      } catch {
        /* URL not parseable — ignore */
      }
    }

    // ── 5. Stage from URL deep-link (mirror of the prior helper,
    //     consolidated here so callers only invoke one prefill hook). ─
    if (typeof window !== 'undefined') {
      try {
        const raw = new URLSearchParams(window.location.search).get('startup_stage')
        if (raw && VALID_STAGES.has(raw as StartupStage) && studio.stage === 'pre_seed') {
          setField('stage', raw as StartupStage)
          markStartupPrefilled('stage')
        }
      } catch {
        /* URL not parseable — ignore */
      }
    }
  }, [bootstrap, setField, updateFormData])
}
