'use client'

/**
 * useStudioIssues
 * ----------------
 *
 * Single source of truth for "what's wrong with this valuation that the
 * advisor / founder should fix BEFORE generating the PDF". Pure-frontend
 * derivation — no network, no engine round-trip.
 *
 * Replaces the practice of letting low-confidence / missing-data signals
 * leak into the rendered report. Instead the wizard surfaces them as
 * structured `StudioIssue` items the AI co-pilot can resolve in a chat
 * turn (each issue carries its own `assistantPrompt`). The PDF stays
 * clean and defensible.
 *
 * Severity contract:
 *   - `block`  — must be resolved or explicitly acknowledged before
 *                "Generate report" submits. These are issues that would
 *                produce a meaningfully wrong / undefendable headline.
 *   - `warn`   — produces a thinner / weaker report but the engine still
 *                returns a defensible blend. Recommended fix; not gating.
 *   - `info`   — transparency only; never gates and never forces an ack.
 *
 * Each issue has a stable `id` so dismissal state can be persisted by
 * callers. The hook itself owns no dismissal state — callers (the
 * Health-check panel) decide how to treat dismissed issues.
 */

import { useMemo } from 'react'
import type { StartupBenchmarkRow } from '@/lib/benchmarks/useStartupBenchmark'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import {
  STUDIO_BERKUS_KEYS,
  STUDIO_SCORECARD_KEYS,
  type StudioMilestoneKey,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import { type LiveValuation, useLiveValuation } from './useLiveValuation'

export type StudioIssueSeverity = 'block' | 'warn' | 'info'

export type StudioStepId =
  | 'profile'
  | 'berkus'
  | 'scorecard'
  | 'founder_pedigree'
  | 'traction'
  | 'exit_story'
  | 'round_simulator'
  | 'report'

export interface StudioIssueCopy {
  en: string
  nl: string
}

export interface StudioIssue {
  id: string
  severity: StudioIssueSeverity
  step: StudioStepId
  title: StudioIssueCopy
  body: StudioIssueCopy
  /**
   * One-line "do this" remedy surfaced in the floating tooltip stack.
   * Kept tighter than `body` — it is the single sentence that, if read in
   * isolation, tells the founder/advisor exactly what to change next.
   */
  action: StudioIssueCopy
  /**
   * Pre-written prompt the AI co-pilot opens with when the advisor taps
   * "Fix with AI". Kept first-person + specific so the assistant doesn't
   * have to re-derive context.
   */
  assistantPrompt: StudioIssueCopy
}

export interface StudioIssuesResult {
  issues: StudioIssue[]
  blockers: StudioIssue[]
  warnings: StudioIssue[]
  infos: StudioIssue[]
}

const SECTORS_REQUIRING_RECURRING_REVENUE = new Set(['saas', 'marketplace', 'fintech'])

function pickIssues(
  state: ReturnType<typeof useStartupValuationStore.getState>,
  valuation: LiveValuation,
  benchmark: StartupBenchmarkRow,
  companyName: string
): StudioIssue[] {
  const issues: StudioIssue[] = []

  // ── 1. Profile completeness ────────────────────────────────────
  if (!companyName.trim()) {
    issues.push({
      id: 'missing_company_name',
      severity: 'block',
      step: 'profile',
      title: {
        en: 'Company name is missing',
        nl: 'Bedrijfsnaam ontbreekt',
      },
      body: {
        en: 'The report cover, deck-ready sentence, and PDF filename all reference the company name.',
        nl: 'De rapportcover, deck-zin en PDF-bestandsnaam verwijzen allemaal naar de bedrijfsnaam.',
      },
      action: {
        en: 'Open Profile and enter the legal company name.',
        nl: 'Open Profiel en vul de juridische bedrijfsnaam in.',
      },
      assistantPrompt: {
        en: 'Help me set the right legal company name for this valuation. What do I need and where will it appear?',
        nl: 'Help me de juiste juridische bedrijfsnaam voor deze waardering te kiezen. Wat heb ik nodig en waar verschijnt die?',
      },
    })
  }

  // ── 2. Berkus evidence — at least one milestone selected ────────
  const anyMilestonePicked = STUDIO_BERKUS_KEYS.some((k) => state.maturity[k] !== 'none')
  if (!anyMilestonePicked) {
    issues.push({
      id: 'no_berkus_milestone',
      severity: 'block',
      step: 'berkus',
      title: {
        en: 'No risk-reduction milestones selected',
        nl: 'Geen risico-reductie mijlpalen gekozen',
      },
      body: {
        en: 'The Berkus leg is the foundation of every pre-seed valuation. Without at least one milestone the engine cannot produce a defensible range.',
        nl: 'De Berkus-leg is de basis van elke pre-seed waardering. Zonder minstens één mijlpaal kan de engine geen verdedigbaar bereik produceren.',
      },
      action: {
        en: 'In Risk reduction, mark at least one milestone above "none".',
        nl: 'Markeer in Risico-reductie minstens één mijlpaal hoger dan "geen".',
      },
      assistantPrompt: {
        en: 'Walk me through the five Berkus milestones (sound idea, prototype, team, partnerships, rollout) and help me pick the right maturity level for each based on what we have today.',
        nl: 'Loop met me door de vijf Berkus-mijlpalen (idee, prototype, team, partnerships, rollout) en help me het juiste niveau te kiezen op basis van wat we vandaag hebben.',
      },
    })
  }

  // ── 3. Investment ask drives the deck sentence ──────────────────
  if (!state.investment_amount_sought || state.investment_amount_sought <= 0) {
    issues.push({
      id: 'missing_investment_ask',
      severity: 'block',
      step: 'round_simulator',
      title: {
        en: 'No round size — deck sentence will be incomplete',
        nl: 'Geen rondegrootte — deck-zin wordt onvolledig',
      },
      body: {
        en: 'Without a target raise we cannot show post-money or dilution, and the VC method falls back to a generic formula.',
        nl: 'Zonder een gewenste raise kunnen we post-money of dilutie niet tonen, en valt de VC-methode terug op een generieke formule.',
      },
      action: {
        en: 'In Round, set a target raise (€) so post-money and dilution can be shown.',
        nl: 'Vul in Ronde een gewenste raise (€) in zodat post-money en dilutie tonen.',
      },
      assistantPrompt: {
        en: 'I am not sure how much to raise. Given my stage and current burn, what round size do similar founders raise and what does that imply for dilution?',
        nl: 'Ik weet niet hoeveel ik wil ophalen. Wat is gebruikelijk voor mijn stage en burn, en wat betekent dat voor dilutie?',
      },
    })
  }

  // ── 4. Stage-aware engine readiness ─────────────────────────────
  // If the founder picked seed / series_a, both VC and SaaS forward
  // legs should ideally fire. Berkus-only at seed+ produces a thin,
  // pre-seed-shaped report.
  const usableLegs = valuation.legs.filter((l) => !l.unavailable && l.value != null)
  const onlyBerkus = usableLegs.length === 1 && usableLegs[0]?.key === 'berkus'
  if ((state.stage === 'seed' || state.stage === 'series_a') && onlyBerkus) {
    issues.push({
      id: 'thin_blend_for_stage',
      severity: 'block',
      step: 'exit_story',
      title: {
        en:
          state.stage === 'seed'
            ? 'Seed stage but only the Berkus leg is firing'
            : 'Series A stage but only the Berkus leg is firing',
        nl:
          state.stage === 'seed'
            ? 'Seed stage maar enkel de Berkus-leg draait'
            : 'Series A stage maar enkel de Berkus-leg draait',
      },
      body: {
        en: 'Investors at this stage expect a forward-looking lens (exit story, current ARR). Add a year-5 projection + exit multiple, or current MRR/ARR, so the blend triangulates.',
        nl: 'Investeerders op dit niveau verwachten een forward-looking lens (exit-verhaal, huidige ARR). Voeg een jaar-5 prognose + exit-multiple of huidige MRR/ARR toe zodat de blend triangulareert.',
      },
      action: {
        en: 'Open Exit story and add year-5 revenue + exit multiple, or enter MRR/ARR in Traction.',
        nl: 'Open Exit-verhaal en voeg jaar-5 omzet + exit-multiple toe, of vul MRR/ARR in onder Tractie.',
      },
      assistantPrompt: {
        en: 'My valuation is firing only the Berkus leg even though my stage is post pre-seed. Help me build out the exit story (year-5 revenue, exit multiple, target ROI) so the VC leg engages too.',
        nl: 'Mijn waardering activeert alleen de Berkus-leg terwijl mijn stage post pre-seed is. Help me het exit-verhaal uit te bouwen (jaar-5 omzet, exit-multiple, target ROI) zodat de VC-leg ook meedoet.',
      },
    })
  }

  // ── 5. Sector vs traction signal ────────────────────────────────
  if (
    SECTORS_REQUIRING_RECURRING_REVENUE.has(state.sector) &&
    (state.mrr == null || state.mrr <= 0) &&
    (state.arr == null || state.arr <= 0)
  ) {
    issues.push({
      id: 'recurring_sector_no_arr',
      severity: 'warn',
      step: 'traction',
      title: {
        en: `No recurring revenue logged for ${state.sector.toUpperCase()}`,
        nl: `Geen terugkerende omzet ingevoerd voor ${state.sector.toUpperCase()}`,
      },
      body: {
        en: 'For SaaS / marketplace / fintech, comparable multiples are anchored to ARR. Without it, the SaaS-forward leg is dropped and the blend collapses to milestone-only.',
        nl: 'Voor SaaS / marketplace / fintech worden vergelijkbare multiples geijkt op ARR. Zonder die input wordt de SaaS-forward leg gedropt en valt de blend terug op enkel mijlpalen.',
      },
      action: {
        en: 'In Traction, enter current MRR or ARR — even an early figure activates the SaaS leg.',
        nl: 'Vul in Tractie huidige MRR of ARR in — zelfs een vroege schatting activeert de SaaS-leg.',
      },
      assistantPrompt: {
        en: 'My sector typically prices on ARR but I have not entered MRR/ARR yet. Help me figure out what to put — or whether pre-revenue is genuinely the right framing for the report.',
        nl: 'Mijn sector wordt meestal geprijsd op ARR maar ik heb nog geen MRR/ARR ingevuld. Help me bepalen wat ik invoer — of dat pre-revenue echt de juiste framing voor het rapport is.',
      },
    })
  }

  // ── 6. Exit story missing → VC leg dropped ──────────────────────
  const vcLegDropped = valuation.legs.find((l) => l.key === 'vc')?.unavailable === true
  if (vcLegDropped && (state.stage === 'seed' || state.stage === 'series_a') && !onlyBerkus) {
    issues.push({
      id: 'no_exit_story',
      severity: 'warn',
      step: 'exit_story',
      title: {
        en: 'VC method leg is not firing',
        nl: 'VC-methode leg draait niet',
      },
      body: {
        en: 'Year-5 revenue, exit multiple or target ROI is missing. Without the VC leg the blend leans heavily on the SaaS-forward / Berkus legs.',
        nl: 'Jaar-5 omzet, exit-multiple of target ROI ontbreekt. Zonder de VC-leg leunt de blend zwaar op de SaaS-forward / Berkus-legs.',
      },
      action: {
        en: 'Fill year-5 revenue, exit multiple, and target ROI in Exit story.',
        nl: 'Vul jaar-5 omzet, exit-multiple en target ROI in onder Exit-verhaal.',
      },
      assistantPrompt: {
        en: 'The VC method leg is greyed out. Walk me through what year-5 revenue, exit multiple, and target ROI to use — sector benchmarks if possible.',
        nl: 'De VC-methode leg staat uit. Loop met me door welke jaar-5 omzet, exit-multiple en target ROI ik kan gebruiken — sector-benchmarks indien mogelijk.',
      },
    })
  }

  // ── 7. Evidence-note coverage (PDF readability) ─────────────────
  const allKeys: readonly StudioMilestoneKey[] = [...STUDIO_BERKUS_KEYS, ...STUDIO_SCORECARD_KEYS]
  const evidenceCount = allKeys.filter(
    (k) => (state.evidence_notes[k] ?? '').trim().length > 0
  ).length
  if (evidenceCount < 2) {
    issues.push({
      id: 'thin_evidence_notes',
      severity: 'warn',
      step: 'berkus',
      title: {
        en: 'Evidence notes are thin',
        nl: 'Onderbouwing is dun',
      },
      body: {
        en: 'Each milestone card prints its evidence sentence in the investor PDF. Less than two filled means the report reads like a slider exercise rather than a defended position.',
        nl: 'Elke mijlpaal-kaart drukt zijn onderbouwing af in de investor-PDF. Minder dan twee ingevuld doet het rapport lezen als een schuifoefening in plaats van een verdedigde stelling.',
      },
      action: {
        en: 'Add evidence notes to at least two milestone cards in Risk reduction.',
        nl: 'Voeg onderbouwing toe aan minstens twee mijlpaal-kaarten in Risico-reductie.',
      },
      assistantPrompt: {
        en: 'Help me draft tight, evidence-based one-liners for the milestones I have selected. Use what is already in the wizard plus reasonable defaults — I will edit afterwards.',
        nl: 'Help me korte, onderbouwde zinnen op te stellen voor de mijlpalen die ik gekozen heb. Gebruik wat er al in de wizard staat en redelijke defaults — ik bewerk daarna.',
      },
    })
  }

  // ── 8. Pedigree consistency — inception_bet without pedigree ────
  const anyPedigreeFlag = Object.values(state.founder_pedigree).some((v) => v === true)
  if (state.inception_lens === 'inception_bet' && !anyPedigreeFlag) {
    issues.push({
      id: 'inception_bet_without_pedigree',
      severity: 'warn',
      step: 'founder_pedigree',
      title: {
        en: 'Inception-bet lens with no pedigree signals',
        nl: 'Inception-bet lens zonder pedigree-signalen',
      },
      body: {
        en: 'The inception-bet overlay assumes a spike founder profile (prior exit, top-tier scaleup alumnus, deep domain). Without any pedigree flag the multiplier is hard to defend in front of investors.',
        nl: 'De inception-bet overlay veronderstelt een spike-founder-profiel (eerdere exit, top-scaleup alumnus, diepe domein-expertise). Zonder pedigree-vlag is de multiplier moeilijk te verdedigen tegenover investeerders.',
      },
      action: {
        en: 'Open Team pedigree and tick at least one signal — or change lens.',
        nl: 'Open Team en vink minstens één signaal aan — of wissel van lens.',
      },
      assistantPrompt: {
        en: 'I picked the inception-bet lens but my pedigree flags are all empty. Help me decide — should I pick a different lens, or is there a pedigree claim I forgot to mark?',
        nl: 'Ik koos de inception-bet lens maar mijn pedigree-vlaggen staan leeg. Help me beslissen — moet ik een andere lens kiezen, of is er een pedigree-claim die ik vergat aan te vinken?',
      },
    })
  }

  // ── 9. Benchmark fallback (advisory) ────────────────────────────
  if (
    benchmark.source.includes('offline') ||
    benchmark.methodology_version === 'studio-v2-offline'
  ) {
    issues.push({
      id: 'benchmark_offline',
      severity: 'info',
      step: 'report',
      title: {
        en: 'Regional benchmark is from offline cache',
        nl: 'Regionale benchmark komt uit offline cache',
      },
      body: {
        en: 'The live Athena feed is unreachable; the wizard is using its static Q1-2026 baseline. Numbers are still defensible but will not reflect the latest quarterly refresh.',
        nl: 'De live Athena-feed is onbereikbaar; de wizard gebruikt zijn statische Q1-2026 baseline. Cijfers blijven verdedigbaar maar weerspiegelen niet de laatste kwartaal-update.',
      },
      action: {
        en: 'No action required — proceed, or wait if you want the latest quarterly refresh.',
        nl: 'Geen actie nodig — ga verder, of wacht op de laatste kwartaal-update.',
      },
      assistantPrompt: {
        en: 'The benchmark fell back to the offline cache. Is this a known outage, and should I pause the report until the live feed is back?',
        nl: 'De benchmark is teruggevallen op de offline cache. Is dit een bekende storing, en moet ik het rapport uitstellen tot de live feed terug is?',
      },
    })
  }

  return issues
}

/**
 * Top-level hook. Re-runs whenever the persisted Studio state, live
 * valuation, or active benchmark row changes.
 */
export function useStudioIssues(benchmark: StartupBenchmarkRow): StudioIssuesResult {
  const valuation = useLiveValuation(benchmark)
  const state = useStartupValuationStore()
  // Company name lives on the manual form store (shared with SME flows);
  // we read it via the same selector StudioShell uses.
  const companyName = useManualFormStore((s) => s.formData.company_name ?? '')

  return useMemo(() => {
    const issues = pickIssues(state, valuation, benchmark, companyName)
    return {
      issues,
      blockers: issues.filter((i) => i.severity === 'block'),
      warnings: issues.filter((i) => i.severity === 'warn'),
      infos: issues.filter((i) => i.severity === 'info'),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.stage,
    state.sector,
    state.country_code,
    state.investment_amount_sought,
    state.year5_revenue_projection,
    state.exit_revenue_multiple,
    state.target_roi_x,
    state.mrr,
    state.arr,
    state.maturity,
    state.evidence_notes,
    state.founder_pedigree,
    state.inception_lens,
    valuation.blended?.mid,
    valuation.legs,
    benchmark.source,
    benchmark.methodology_version,
    companyName,
  ])
}
