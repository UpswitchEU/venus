'use client'

/**
 * useStudioIssues
 * ----------------
 *
 * Single source of truth for "what's wrong with this valuation that the
 * advisor / founder should fix BEFORE generating the PDF". Pure-frontend
 * derivation from the Studio store + the same pure `useLiveValuation` math
 * the receipt uses — no Titan round-trip for issue detection.
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
import { projectForwardArrEur } from '@/components/calculator/sections/startup/regionalBaseline'
import { resolveHeadlinePreMoney } from '@/features/startup-studio/utils/resolveHeadlinePreMoney'
import type { StartupBenchmarkRow } from '@/lib/benchmarks/useStartupBenchmark'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import {
  STARTUP_SECTOR_DEFAULT_Y5_REVENUE,
  STUDIO_BERKUS_KEYS,
  STUDIO_SCORECARD_KEYS,
  type StudioMilestoneKey,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import studioEn from '../../../../messages/startupStudio/en.json'
import studioFr from '../../../../messages/startupStudio/fr.json'
import studioNl from '../../../../messages/startupStudio/nl.json'
import { formatEur, type LiveValuation, useLiveValuation } from './useLiveValuation'

export type StudioIssueSeverity = 'block' | 'warn' | 'info'

export type StudioStepId =
  | 'profile'
  | 'berkus'
  | 'scorecard'
  | 'founder_pedigree'
  | 'traction'
  | 'exit_story'
  | 'round_simulator'

export interface StudioIssueCopy {
  en: string
  nl: string
  fr: string
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
        fr: "Le nom de l'entreprise est manquant",
      },
      body: {
        en: 'The report cover, deck-ready sentence, and PDF filename all reference the company name.',
        nl: 'De rapportcover, deck-zin en PDF-bestandsnaam verwijzen allemaal naar de bedrijfsnaam.',
        fr: "La couverture du rapport, la phrase prête à être publiée et le nom du fichier PDF font tous référence au nom de l'entreprise.",
      },
      action: {
        en: 'Open Profile and enter the legal company name.',
        nl: 'Open Profiel en vul de juridische bedrijfsnaam in.',
        fr: "Ouvrez le profil et entrez le nom légal de l'entreprise.",
      },
      assistantPrompt: {
        en: 'Help me set the right legal company name for this valuation. What do I need and where will it appear?',
        nl: 'Help me de juiste juridische bedrijfsnaam voor deze waardering te kiezen. Wat heb ik nodig en waar verschijnt die?',
        fr: 'Aidez-moi à définir la dénomination sociale appropriée pour cette évaluation. De quoi ai-je besoin et où apparaîtra-t-il ?',
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
        fr: 'Aucun jalon de réduction des risques sélectionné',
      },
      body: {
        en: 'The Berkus leg is the foundation of every pre-seed valuation. Without at least one milestone the engine cannot produce a defensible range.',
        nl: 'De Berkus-leg is de basis van elke pre-seed waardering. Zonder minstens één mijlpaal kan de engine geen verdedigbaar bereik produceren.',
        fr: 'La composante Berkus est la base de toute évaluation pré-amorçage. Sans au moins une étape importante, le moteur ne peut pas produire une fourchette défendable.',
      },
      action: {
        en: 'In Risk reduction, mark at least one milestone above "none".',
        nl: 'Markeer in Risico-reductie minstens één mijlpaal hoger dan "geen".',
        fr: 'Dans Réduction des risques, marquez au moins un jalon au-dessus de « aucun ».',
      },
      assistantPrompt: {
        en: 'Walk me through the five Berkus milestones (sound idea, prototype, team, partnerships, rollout) and help me pick the right maturity level for each based on what we have today.',
        nl: 'Loop met me door de vijf Berkus-mijlpalen (idee, prototype, team, partnerships, rollout) en help me het juiste niveau te kiezen op basis van wat we vandaag hebben.',
        fr: "Guidez-moi à travers les cinq étapes de Berkus (idée solide, prototype, équipe, partenariats, déploiement) et aidez-moi à choisir le bon niveau de maturité pour chacun en fonction de ce que nous avons aujourd'hui.",
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
        fr: 'Pas de taille du tour — la phrase du jeu sera incomplète',
      },
      body: {
        en: 'Without a target raise we cannot show post-money or dilution, and the VC method falls back to a generic formula.',
        nl: 'Zonder een gewenste raise kunnen we post-money of dilutie niet tonen, en valt de VC-methode terug op een generieke formule.',
        fr: 'Sans augmentation cible, nous ne pouvons pas afficher de post-financement ou de dilution, et la méthode VC revient à une formule générique.',
      },
      action: {
        en: 'In Round, set a target raise (€) so post-money and dilution can be shown.',
        nl: 'Vul in Ronde een gewenste raise (€) in zodat post-money en dilutie tonen.',
        fr: 'Lors du tour, fixez une augmentation cible (€) afin que le post-argent et la dilution puissent être affichés.',
      },
      assistantPrompt: {
        en: 'I am not sure how much to raise. Given my stage and current burn, what round size do similar founders raise and what does that imply for dilution?',
        nl: 'Ik weet niet hoeveel ik wil ophalen. Wat is gebruikelijk voor mijn stage en burn, en wat betekent dat voor dilutie?',
        fr: "Je ne sais pas combien augmenter. Compte tenu de mon stade et de ma brûlure actuelle, quelle taille du tour les fondateurs similaires élèvent-ils et qu'est-ce que cela implique pour la dilution ?",
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
        fr:
          state.stage === 'seed'
            ? 'Stade seed, mais seule la composante Berkus est active'
            : 'Stade Series A, mais seule la composante Berkus est active',
      },
      body: {
        en: 'Investors at this stage expect a forward-looking lens (exit story, current ARR). Add a year-5 projection + exit multiple, or current MRR/ARR, so the blend triangulates.',
        nl: 'Investeerders op dit niveau verwachten een forward-looking lens (exit-verhaal, huidige ARR). Voeg een jaar-5 prognose + exit-multiple of huidige MRR/ARR toe zodat de blend triangulareert.',
        fr: 'À ce stade, les investisseurs s’attendent à une perspective prospective (histoire de sortie, ARR actuel). Ajoutez une projection sur 5 ans + un multiple de sortie, ou un MRR/ARR actuel, pour que le mélange triangule.',
      },
      action: {
        en: 'Open Exit story and add year-5 revenue + exit multiple, or enter MRR/ARR in Traction.',
        nl: 'Open Exit-verhaal en voeg jaar-5 omzet + exit-multiple toe, of vul MRR/ARR in onder Tractie.',
        fr: "Ouvrez l'histoire de sortie et ajoutez les revenus de l'année 5 + le multiple de sortie, ou entrez MRR/ARR dans Traction.",
      },
      assistantPrompt: {
        en: 'My valuation is firing only the Berkus leg even though my stage is post pre-seed. Help me build out the exit story (year-5 revenue, exit multiple, target ROI) so the VC leg engages too.',
        nl: 'Mijn waardering activeert alleen de Berkus-leg terwijl mijn stage post pre-seed is. Help me het exit-verhaal uit te bouwen (jaar-5 omzet, exit-multiple, target ROI) zodat de VC-leg ook meedoet.',
        fr: "Ma valorisation ne déclenche que la composante Berkus même si mon stade est post-pré-amorçage. Aidez-moi à élaborer l'histoire de sortie (revenus de la cinquième année, multiples de sortie, retour sur investissement cible) afin que la composante VC s'engage également.",
      },
    })
  }

  // ── 5. Sector vs traction signal ────────────────────────────────
  if (
    SECTORS_REQUIRING_RECURRING_REVENUE.has(state.sector) &&
    state.revenue_status !== 'no' &&
    (state.mrr == null || state.mrr <= 0) &&
    (state.arr == null || state.arr <= 0)
  ) {
    const sectorLabelEn =
      studioEn.narrative.sectorLabels[state.sector as keyof typeof studioEn.narrative.sectorLabels]
    const sectorLabelNl =
      studioNl.narrative.sectorLabels[state.sector as keyof typeof studioNl.narrative.sectorLabels]
    const sectorLabelFr =
      studioFr.narrative.sectorLabels[state.sector as keyof typeof studioFr.narrative.sectorLabels]
    issues.push({
      id: 'recurring_sector_no_arr',
      severity: 'warn',
      step: 'traction',
      title: {
        en: `No recurring revenue logged for ${sectorLabelEn}`,
        nl: `Geen terugkerende omzet ingevoerd voor ${sectorLabelNl}`,
        fr: `Aucun revenu récurrent enregistré pour ${sectorLabelFr}`,
      },
      body: {
        en: 'For SaaS / marketplace / fintech, comparable multiples are anchored to ARR. Without it, the SaaS-forward leg is dropped and the blend collapses to milestone-only.',
        nl: 'Voor SaaS / marketplace / fintech worden vergelijkbare multiples geijkt op ARR. Zonder die input wordt de SaaS-forward leg gedropt en valt de blend terug op enkel mijlpalen.',
        fr: "Pour le SaaS/place de marché/fintech, des multiples comparables sont ancrés à l'ARR. Sans cela, la jambe avant SaaS est abandonnée et le mélange se réduit à un jalon uniquement.",
      },
      action: {
        en: 'In Traction, enter current MRR or ARR — even an early figure activates the SaaS leg.',
        nl: 'Vul in Tractie huidige MRR of ARR in — zelfs een vroege schatting activeert de SaaS-leg.',
        fr: "Dans Traction, saisissez le MRR ou l'ARR actuel – même un chiffre précoce active la branche SaaS.",
      },
      assistantPrompt: {
        en: 'My sector typically prices on ARR but I have not entered MRR/ARR yet. Help me figure out what to put — or whether pre-revenue is genuinely the right framing for the report.',
        nl: 'Mijn sector wordt meestal geprijsd op ARR maar ik heb nog geen MRR/ARR ingevuld. Help me bepalen wat ik invoer — of dat pre-revenue echt de juiste framing voor het rapport is.',
        fr: 'Mon secteur tarife généralement sur ARR mais je ne suis pas encore entré dans MRR/ARR. Aidez-moi à déterminer quoi mettre – ou si les pré-revenus sont véritablement le bon cadre pour le rapport.',
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
        fr: 'La jambe de méthode VC ne se déclenche pas',
      },
      body: {
        en: 'Year-5 revenue, exit multiple or target ROI is missing. Without the VC leg the blend leans heavily on the SaaS-forward / Berkus legs.',
        nl: 'Jaar-5 omzet, exit-multiple of target ROI ontbreekt. Zonder de VC-leg leunt de blend zwaar op de SaaS-forward / Berkus-legs.',
        fr: "Les revenus de la cinquième année, les sorties multiples ou le retour sur investissement cible sont manquants. Sans la jambe VC, le mélange s'appuie fortement sur les jambes SaaS-forward / Berkus.",
      },
      action: {
        en: 'Fill year-5 revenue, exit multiple, and target ROI in Exit story.',
        nl: 'Vul jaar-5 omzet, exit-multiple en target ROI in onder Exit-verhaal.',
        fr: "Remplissez les revenus de la cinquième année, quittez plusieurs et ciblez le retour sur investissement dans l'histoire de sortie.",
      },
      assistantPrompt: {
        en: 'The VC method leg is greyed out. Walk me through what year-5 revenue, exit multiple, and target ROI to use — sector benchmarks if possible.',
        nl: 'De VC-methode leg staat uit. Loop met me door welke jaar-5 omzet, exit-multiple en target ROI ik kan gebruiken — sector-benchmarks indien mogelijk.',
        fr: 'La jambe de la méthode VC est grisée. Expliquez-moi quels revenus de la cinquième année, quelles sorties multiples et quel retour sur investissement cible utiliser - des références sectorielles si possible.',
      },
    })
  }

  // ── 6a-bis. Year-5 revenue sanity check ─────────────────────────
  // Two warnings on the leveraged Y5 thesis:
  //   1. Y5 ≥ 10× the sector default — without an explicit moat the
  //      VC backsolve gives the founder a misleadingly large pre-money.
  //   2. Y5 < forward-projected ARR — the founder is implicitly
  //      forecasting a *decline* from current trajectory, which any
  //      seasoned VC will challenge in the first call.
  // Skipped when the founder hasn't entered a Y5 yet (the engine seeds
  // it for them on first paint, but the warning would be noise on the
  // sector default).
  const y5Value = state.year5_revenue_projection
  const sectorDefaultY5 = STARTUP_SECTOR_DEFAULT_Y5_REVENUE[state.sector] ?? 5_000_000
  if (typeof y5Value === 'number' && y5Value > 0 && sectorDefaultY5 > 0) {
    const ratio = y5Value / sectorDefaultY5
    if (ratio >= 10) {
      issues.push({
        id: 'y5_above_sector_default',
        severity: 'warn',
        step: 'exit_story',
        title: {
          en: `Year-5 revenue is ${ratio.toFixed(0)}× the sector default`,
          nl: `Jaar-5 omzet is ${ratio.toFixed(0)}× de sector-default`,
          fr: `Le revenu de l'année 5 est ${ratio.toFixed(0)}× la valeur par défaut du secteur`,
        },
        body: {
          en: `You're projecting ${formatEur(y5Value)} by year 5 vs. a ${formatEur(sectorDefaultY5)} default for this stage / sector. Numbers this far above the benchmark need an explicit moat or distribution thesis investors can underwrite.`,
          nl: `Je projecteert ${formatEur(y5Value)} in jaar 5 t.o.v. een ${formatEur(sectorDefaultY5)} default voor deze fase/sector. Cijfers zo ver boven de benchmark vragen een expliciete moat- of distributie-thesis die investeerders kunnen onderschrijven.`,
          fr: `Vous projetez ${formatEur(y5Value)} en année 5 contre une valeur par défaut de ${formatEur(sectorDefaultY5)} pour ce stade / secteur. Un écart aussi élevé au benchmark exige une thèse explicite de moat ou de distribution que les investisseurs peuvent défendre.`,
        },
        action: {
          en: 'Either lower Year-5 to the sector range, or add an evidence note on Berkus / Scorecard explaining the moat.',
          nl: 'Verlaag Year-5 naar de sectorrange, of voeg een onderbouwing toe op Berkus / Scorecard die de moat uitlegt.',
          fr: "Soit abaissez l'année 5 à la fourchette du secteur, soit ajoutez une note de preuve sur Berkus / Scorecard expliquant le fossé.",
        },
        assistantPrompt: {
          en: `My Year-5 revenue (${formatEur(y5Value)}) is ${ratio.toFixed(1)}× the sector default. Help me decide whether to defend it with a moat thesis or dial it down.`,
          nl: `Mijn jaar-5 omzet (${formatEur(y5Value)}) is ${ratio.toFixed(1)}× de sector-default. Help me beslissen of ik dit verdedig met een moat-thesis of bijstel.`,
          fr: `Mon revenu de l'année 5 (${formatEur(y5Value)}) est ${ratio.toFixed(1)}× la valeur par défaut du secteur. Aidez-moi à décider si je dois le défendre avec une thèse de moat ou le réduire.`,
        },
      })
    }

    const forwardArr = projectForwardArrEur({
      mrr: state.mrr,
      arr: state.arr,
      momGrowthPct: state.mrr_growth_rate_pct,
    })
    if (typeof forwardArr === 'number' && forwardArr > 0 && y5Value < forwardArr) {
      issues.push({
        id: 'y5_below_forward_arr',
        severity: 'warn',
        step: 'exit_story',
        title: {
          en: 'Year-5 revenue is below your year-1 trajectory',
          nl: 'Jaar-5 omzet ligt onder je jaar-1 traject',
          fr: 'Les revenus de la cinquième année sont inférieurs à votre trajectoire de la première année',
        },
        body: {
          en: `Your current MRR + monthly growth project ${formatEur(forwardArr)} 12 months out, but Year-5 revenue is set to ${formatEur(y5Value)}. That's a flat-or-declining curve — investors will read it as missing thesis or stale input.`,
          nl: `Je huidige MRR en maandelijkse groei projecteren ${formatEur(forwardArr)} over 12 maanden, maar Year-5 staat op ${formatEur(y5Value)}. Dat is een vlakke of dalende curve — investeerders lezen dat als ontbrekende thesis of verouderde input.`,
          fr: `Votre MRR actuel et votre croissance mensuelle projettent ${formatEur(forwardArr)} à 12 mois, mais le revenu de l'année 5 est défini à ${formatEur(y5Value)}. C'est une courbe plate ou décroissante : les investisseurs y verront une thèse manquante ou une donnée obsolète.`,
        },
        action: {
          en: 'Raise Year-5 above your forward 12mo ARR, or revisit MRR / monthly growth in Traction if those inputs are stale.',
          nl: 'Verhoog Year-5 boven je forward 12mo ARR, of corrigeer MRR / maandelijkse groei onder Tractie als die inputs verouderd zijn.',
          fr: "Augmentez l'année 5 au-dessus de votre ARR à terme de 12 mois, ou revisitez le MRR / la croissance mensuelle de Traction si ces entrées sont obsolètes.",
        },
        assistantPrompt: {
          en: `My Year-5 revenue (${formatEur(y5Value)}) is below the 12mo forward ARR (${formatEur(forwardArr)}) my MRR + growth imply. What's a credible Year-5 anchor for my stage?`,
          nl: `Mijn jaar-5 omzet (${formatEur(y5Value)}) ligt onder de 12mo forward ARR (${formatEur(forwardArr)}) die mijn MRR + groei impliceren. Wat is een geloofwaardige jaar-5 anchor voor mijn fase?`,
          fr: `Mon revenu de l'année 5 (${formatEur(y5Value)}) est inférieur à l'ARR prospectif à 12 mois (${formatEur(forwardArr)}) impliqué par mon MRR et ma croissance. Quel ancrage crédible d'année 5 convient à mon stade ?`,
        },
      })
    }
  }

  // ── 6a-ter. Target ROI sanity check ─────────────────────────────
  // Fires when the founder types an ROI below ~5×.  The field collects
  // the *fund-side* hurdle (what the VC needs back to justify the
  // cheque), not the founder's personal expected return — and even
  // late-stage funds underwrite ≥5×.  Anything below is almost
  // certainly a typo or a misread of the input label.  Stage defaults
  // are 30× / 20× / 10× so a human-typed value of 1×–4× is the only
  // way to trip this.
  const roiValue = state.target_roi_x
  if (typeof roiValue === 'number' && roiValue > 0 && roiValue < 5) {
    issues.push({
      id: 'target_roi_too_low',
      severity: 'warn',
      step: 'exit_story',
      title: {
        en: `Target ROI of ${roiValue}× looks too low`,
        nl: `Target ROI van ${roiValue}× lijkt te laag`,
        fr: `Le ROI cible de ${roiValue}× semble trop bas`,
      },
      body: {
        en: `The Target ROI field is the *fund-side* return hurdle (what the VC needs back to justify the cheque) — typically 30× pre-seed, 20× seed, 10× Series A. Below 5× is almost certainly a typo or a confusion with your personal expected return. The lower this number, the higher your pre-money — so investors will challenge it.`,
        nl: `Het Target ROI-veld is de *fonds-zijde* return hurdle (wat de VC terug moet zien om de cheque te rechtvaardigen) — typisch 30× pre-seed, 20× seed, 10× Series A. Onder 5× is bijna zeker een typfout of verwarring met je persoonlijke verwachte rendement. Hoe lager dit cijfer, hoe hoger je pre-money — investeerders zullen het aanvechten.`,
        fr: "Le champ ROI cible est l'obstacle de retour *côté fonds* (ce dont le capital-risque a besoin pour justifier le chèque) — généralement 30 × pré-amorçage, 20 × graine, 10 × série A. En dessous de 5 × est presque certainement une faute de frappe ou une confusion avec votre rendement personnel attendu. Plus ce nombre est bas, plus votre pré-argent est élevé – les investisseurs le contesteront donc.",
      },
      action: {
        en: 'Use a stage-typical preset (30×/20×/10×) under Exit story, or confirm a value above 5×.',
        nl: 'Gebruik een fase-typische preset (30×/20×/10×) onder Exit-verhaal, of bevestig een waarde boven 5×.',
        fr: 'Utilisez un préréglage typique de la stade (30×/20×/10×) dans Histoire de sortie ou confirmez une valeur supérieure à 5×.',
      },
      assistantPrompt: {
        en: `My target ROI is set to ${roiValue}× which seems low for the VC backsolve. What's a credible number for my stage?`,
        nl: `Mijn target ROI staat op ${roiValue}× wat laag lijkt voor de VC backsolve. Wat is een geloofwaardig cijfer voor mijn fase?`,
        fr: `Mon ROI cible est défini à ${roiValue}×, ce qui semble bas pour le calcul VC. Quel chiffre crédible convient à mon stade ?`,
      },
    })
  }

  // ── 6b. This-round new-investor % (priced cap preview) ────────────
  // Same math as Round simulator / VC `next_round_dilution_pct`: not the
  // cumulative-to-exit dilution field. Skip when SAFE notes exist — slice is
  // undefined until conversion.
  const invRound = state.investment_amount_sought
  const preForSlice = resolveHeadlinePreMoney(
    state.cap_table.pre_money_target,
    valuation.blended?.mid ?? null
  )
  if (
    state.cap_table.safe_notes.length === 0 &&
    typeof invRound === 'number' &&
    invRound > 0 &&
    typeof preForSlice === 'number' &&
    preForSlice > 0
  ) {
    const postSlice = preForSlice + invRound
    const roundPctSlice = (invRound / postSlice) * 100
    if (roundPctSlice > 22 && Number.isFinite(roundPctSlice)) {
      const preHint12 = invRound / 0.12 - invRound
      const preHintStr = preHint12 > 0 && Number.isFinite(preHint12) ? formatEur(preHint12) : '—'
      issues.push({
        id: 'high_priced_round_slice',
        severity: 'warn',
        step: 'round_simulator',
        title: {
          en: 'Large slice to new investors this round',
          nl: 'Groot aandeel voor nieuwe investeerders deze ronde',
          fr: 'Une part importante pour les nouveaux investisseurs ce tour',
        },
        body: {
          en: `At ~${roundPctSlice.toFixed(1)}% post-money for this raise, the bar is pricing a big single cheque — often founders aim closer to 10–15%. About 12% at this raise implies pre-money near ${preHintStr} (illustrative). The cumulative “dilution to exit” field does not change this %.`,
          nl: `Met ~${roundPctSlice.toFixed(1)}% post-money voor deze raise is dat een grote hap — veel founders mikken richting 10–15% per ronde. ~12% zou hier ruwweg pre-money rond ${preHintStr} impliceren (illustratief). Het cumulatieve “verwatering tot exit”-veld wijzigt dit % niet.`,
          fr: `À environ ${roundPctSlice.toFixed(1)}% post-money pour cette levée, le tour valorise un chèque unique important. Les fondateurs visent souvent plutôt 10 à 15%. Environ 12% pour cette levée implique un pré-money proche de ${preHintStr} (indicatif). Le champ cumulatif « dilution jusqu'à la sortie » ne modifie pas ce %.`,
        },
        action: {
          en: 'In Round, check pre-money vs raise — or confirm an intentional down-round / aggressive ask.',
          nl: 'Controleer in Ronde pre-money t.o.v. raise — of bevestig een bewuste down-round / zware ask.',
          fr: 'Au cours du tour, vérifiez le pré-money par rapport à la levée – ou confirmez une demande intentionnelle / agressive.',
        },
        assistantPrompt: {
          en: 'My cap table shows a high % to new investors for this priced round. Help me sanity-check pre-money and round size vs typical benchmarks for my stage.',
          nl: 'Mijn cap-tabel toont een hoog % voor nieuwe investeerders. Help me pre-money en rondgrootte te toetsen aan benchmarks voor mijn stage.',
          fr: 'Mon tableau de capitalisation montre un pourcentage élevé de nouveaux investisseurs pour ce cycle de tarification. Aidez-moi à vérifier le pré-argent et la taille du tour par rapport aux références typiques de ma stade.',
        },
      })
    }
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
        fr: 'Les notes de preuves sont minces',
      },
      body: {
        en: 'Each milestone card prints its evidence sentence in the investor PDF. Less than two filled means the report reads like a slider exercise rather than a defended position.',
        nl: 'Elke mijlpaal-kaart drukt zijn onderbouwing af in de investor-PDF. Minder dan twee ingevuld doet het rapport lezen als een schuifoefening in plaats van een verdedigde stelling.',
        fr: "Chaque carte d'étape imprime sa phrase de preuve dans le PDF de l'investisseur. Moins de deux réponses signifient que le rapport se lit comme un exercice de curseur plutôt que comme une position défendue.",
      },
      action: {
        en: 'Add evidence notes to at least two milestone cards in Risk reduction.',
        nl: 'Voeg onderbouwing toe aan minstens twee mijlpaal-kaarten in Risico-reductie.',
        fr: 'Ajoutez des notes de preuves à au moins deux cartes d’étape dans la réduction des risques.',
      },
      assistantPrompt: {
        en: 'Help me draft tight, evidence-based one-liners for the milestones I have selected. Use what is already in the wizard plus reasonable defaults — I will edit afterwards.',
        nl: 'Help me korte, onderbouwde zinnen op te stellen voor de mijlpalen die ik gekozen heb. Gebruik wat er al in de wizard staat en redelijke defaults — ik bewerk daarna.',
        fr: "Aidez-moi à rédiger des lignes directrices précises et fondées sur des preuves pour les étapes que j'ai sélectionnées. Utilisez ce qui est déjà dans l'assistant ainsi que les valeurs par défaut raisonnables - je modifierai ensuite.",
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
        fr: 'Objectif de pari initial sans signaux généalogiques',
      },
      body: {
        en: 'The inception-bet overlay assumes a spike founder profile (prior exit, top-tier scaleup alumnus, deep domain). Without any pedigree flag the multiplier is hard to defend in front of investors.',
        nl: 'De inception-bet overlay veronderstelt een spike-founder-profiel (eerdere exit, top-scaleup alumnus, diepe domein-expertise). Zonder pedigree-vlag is de multiplier moeilijk te verdedigen tegenover investeerders.',
        fr: "La superposition de pari de création suppose un profil de fondateur de pointe (sortie préalable, ancien élève de premier plan, domaine profond). Sans aucun drapeau d'origine, le multiplicateur est difficile à défendre devant les investisseurs.",
      },
      action: {
        en: 'Open Team pedigree and tick at least one signal — or change lens.',
        nl: 'Open Team en vink minstens één signaal aan — of wissel van lens.',
        fr: 'Ouvrez le pedigree de l’équipe et cochez au moins un signal – ou changez d’objectif.',
      },
      assistantPrompt: {
        en: 'I picked the inception-bet lens but my pedigree flags are all empty. Help me decide — should I pick a different lens, or is there a pedigree claim I forgot to mark?',
        nl: 'Ik koos de inception-bet lens maar mijn pedigree-vlaggen staan leeg. Help me beslissen — moet ik een andere lens kiezen, of is er een pedigree-claim die ik vergat aan te vinken?',
        fr: "J'ai choisi l'objectif du pari initial, mais mes drapeaux de pedigree sont tous vides. Aidez-moi à décider : dois-je choisir un objectif différent ou y a-t-il une déclaration d'ascendance que j'ai oublié de noter ?",
      },
    })
  }

  // Inception-lens recommendation (the "your profile fits the
  // Inception-bet / Momentum-driven lens" nudge) used to live here
  // as a Studio-CoPilot info issue. That's analytical advisory on
  // the founder's profile shape, which belongs on the report side —
  // moved to the advisor-CTA partial in the ValuationIQ report
  // (2026-05-10) where the rest of the lens-overlay narrative sits.
  // The lens picker itself stays in `ExitStoryStep` because it's an
  // input control (the founder picks which overlay to apply); the
  // recommendation of WHICH lens to pick is now downstream.

  // ── 9. Benchmark fallback (advisory) ────────────────────────────
  if (
    benchmark.source.includes('offline') ||
    benchmark.methodology_version === 'studio-v2-offline'
  ) {
    issues.push({
      id: 'benchmark_offline',
      severity: 'info',
      step: 'profile',
      title: {
        en: 'Regional benchmark is from offline cache',
        nl: 'Regionale benchmark komt uit offline cache',
        fr: 'La référence régionale provient du cache hors ligne',
      },
      body: {
        en: 'The live benchmark feed is unreachable; the wizard is using its static Q1-2026 baseline. Numbers are still defensible but will not reflect the latest quarterly refresh.',
        nl: 'De live benchmarkfeed is onbereikbaar; de wizard gebruikt zijn statische Q1-2026 baseline. Cijfers blijven verdedigbaar maar weerspiegelen niet de laatste kwartaal-update.',
        fr: "Le flux benchmark en direct est inaccessible ; l'assistant utilise sa référence statique T1-2026. Les chiffres sont toujours défendables mais ne refléteront pas la dernière actualisation trimestrielle.",
      },
      action: {
        en: 'No action required — proceed, or wait if you want the latest quarterly refresh.',
        nl: 'Geen actie nodig — ga verder, of wacht op de laatste kwartaal-update.',
        fr: 'Aucune action requise : continuez ou attendez si vous souhaitez la dernière actualisation trimestrielle.',
      },
      assistantPrompt: {
        en: 'The benchmark fell back to the offline cache. Is this a known outage, and should I pause the report until the live feed is back?',
        nl: 'De benchmark is teruggevallen op de offline cache. Is dit een bekende storing, en moet ik het rapport uitstellen tot de live feed terug is?',
        fr: "Le benchmark est revenu au cache hors ligne. S'agit-il d'une panne connue et dois-je suspendre le rapport jusqu'à ce que le flux en direct soit de retour ?",
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
    state.cap_table,
    state.year5_revenue_projection,
    state.exit_revenue_multiple,
    state.target_roi_x,
    state.mrr,
    state.arr,
    state.mrr_growth_rate_pct,
    state.maturity,
    state.evidence_notes,
    state.founder_pedigree,
    state.inception_lens,
    valuation.blended?.mid,
    valuation.legs,
    benchmark.source,
    benchmark.methodology_version,
    companyName,
    valuation,
    benchmark,
    state,
  ])
}
