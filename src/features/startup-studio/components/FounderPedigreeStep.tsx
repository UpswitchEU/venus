'use client'

/**
 * Step — Founder Pedigree.
 *
 * Six discrete, defensible qualifications that drive a multiplicative
 * overlay on the leg-blend baseline (Berkus + Scorecard + VC + SaaS
 * Forward).  Replaces the implicit "management strength" slider in
 * Berkus + Scorecard with an explicit, investor-verifiable claim.
 *
 * Engine source-of-truth lives in:
 *   `apps/valuation-iq/src/domain/startup_valuation/founder_pedigree.py`
 *
 * The UI mirrors the deltas (`PEDIGREE_DELTA_PCT`) so the live receipt
 * can render the "+0.30×" / "−0.20×" chips without an engine round-trip.
 * The headline number on the report always comes back from the engine.
 *
 * Mutual exclusion: picking ``solo_founder`` clears
 * ``has_technical_cofounder`` (and vice-versa) so the founder cannot
 * claim both a discount and a lift on the same axis.
 */

import { motion } from 'framer-motion'
import { Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  calculatePedigreeMultiplier,
  type FounderPedigreeKey,
  PEDIGREE_DELTA_PCT,
  PEDIGREE_KEYS,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'

type Locale = 'en' | 'nl'

interface PedigreeOptionCopy {
  title: { en: string; nl: string }
  description: { en: string; nl: string }
  evidence: { en: string; nl: string }
}

const PEDIGREE_COPY: Record<FounderPedigreeKey, PedigreeOptionCopy> = {
  prior_exit: {
    title: {
      en: 'Prior venture-backed exit (≥€10M)',
      nl: 'Eerdere venture-backed exit (≥€10M)',
    },
    description: {
      en: 'Any cofounder has exited a previous venture-backed company at €10M+ enterprise value.',
      nl: 'Een medeoprichter heeft eerder een venture-backed bedrijf verkocht voor €10M+.',
    },
    evidence: {
      en: 'Investors verify: Crunchbase / Dealroom exit record, public press release, or LP reference.',
      nl: 'Investeerders verifiëren: Crunchbase / Dealroom, persbericht, of LP-referentie.',
    },
  },
  top_unicorn_alumnus: {
    title: {
      en: 'Top-tier scaleup alumnus',
      nl: 'Senior alumnus topscaleup',
    },
    description: {
      en: 'Any cofounder spent ≥2 years at IC4+ / senior level inside a Benelux or European top-tier scaleup (Adyen, Showpad, Collibra, Bol, Mollie, UiPath, Klarna, Wise, Spotify…).',
      nl: '≥2 jaar senior ervaring bij een Beneluxse of Europese topscaleup (Adyen, Showpad, Collibra, Bol, Mollie, UiPath, Klarna, Wise, Spotify…).',
    },
    evidence: {
      en: 'Investors verify: LinkedIn tenure + role band; many funds maintain a "mafia" graph of these networks.',
      nl: 'Investeerders verifiëren: LinkedIn-duur + rol-niveau; veel fondsen onderhouden een "mafia"-graph.',
    },
  },
  domain_expert_10y: {
    title: {
      en: '10+ years industry experience',
      nl: '10+ jaar branche-ervaring',
    },
    description: {
      en: "Any cofounder has 10+ years operating experience inside the target customer's industry — founder-market fit beats generic founder strength at pre-seed.",
      nl: 'Een medeoprichter heeft 10+ jaar operationele ervaring in de doelsector — founder-market fit weegt zwaarder dan generieke "founder strength".',
    },
    evidence: {
      en: 'Investors verify: prior employer references; reverse interviews with target customers asking "would you buy from this person?"',
      nl: 'Investeerders verifiëren: referenties van vorige werkgevers; klantgesprekken: "zou je kopen van deze persoon?"',
    },
  },
  second_time_founder: {
    title: {
      en: 'Second-time founder',
      nl: 'Tweede keer oprichter',
    },
    description: {
      en: 'Any cofounder previously founded a company that operated for ≥2 years (no exit required — the "I shipped a company" signal alone is meaningful).',
      nl: 'Een medeoprichter richtte eerder een bedrijf op dat ≥2 jaar actief was (geen exit vereist — alleen het "ik heb een bedrijf gerund" signaal telt).',
    },
    evidence: {
      en: 'Investors verify: KBO/KVK incorporation history, prior cap table, GitHub or product archives.',
      nl: 'Investeerders verifiëren: KBO/KVK-historiek, eerdere cap-tabel, archief van product of GitHub.',
    },
  },
  has_technical_cofounder: {
    title: {
      en: 'Full-time technical cofounder',
      nl: 'Voltijdse technische medeoprichter',
    },
    description: {
      en: 'At least one full-time technical cofounder owns the codebase end-to-end. Mitigates the most common pre-seed execution risk (outsourced engineering).',
      nl: 'Minstens één voltijdse technische medeoprichter eigent zich de codebase volledig toe. Verlaagt het meest voorkomende pre-seed uitvoeringsrisico (uitbestede engineering).',
    },
    evidence: {
      en: 'Investors verify: equity split, GitHub commits, technical due diligence interview.',
      nl: 'Investeerders verifiëren: aandeelhoudersverdeling, GitHub-commits, technische due-diligence.',
    },
  },
  solo_founder: {
    title: {
      en: 'Solo founder (no cofounders)',
      nl: 'Solo-oprichter (geen medeoprichters)',
    },
    description: {
      en: 'Single founder operating without cofounders. Solo founders close at materially lower pre-money in published Benelux datasets — the discount is empirical, not a judgment.',
      nl: 'Eén oprichter zonder medeoprichters. Solo-oprichters sluiten significant lager in gepubliceerde Benelux-datasets — de korting is empirisch, geen oordeel.',
    },
    evidence: {
      en: "Picking this clears the technical-cofounder lift — both can't be true at once.",
      nl: 'Bij selectie vervalt de "technische medeoprichter" lift — beide kunnen niet tegelijk waar zijn.',
    },
  },
}

interface FounderPedigreeStepProps {
  locale?: Locale
}

function formatDelta(delta: number): string {
  const sign = delta > 0 ? '+' : '−'
  return `${sign}${Math.abs(delta).toFixed(2)}×`
}

export function FounderPedigreeStep({ locale = 'en' }: FounderPedigreeStepProps) {
  const flags = useStartupValuationStore((s) => s.founder_pedigree)
  const setFlag = useStartupValuationStore((s) => s.setPedigreeFlag)

  const multiplier = calculatePedigreeMultiplier(flags)
  const isLift = multiplier > 1.0
  const isDiscount = multiplier < 1.0

  return (
    <div className="space-y-5">
      {/* Intro + live multiplier ----------------------------------- */}
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm leading-relaxed text-foreground/70">
              {locale === 'nl' ? (
                <>
                  Investeerders prijzen pre-seed niet alleen op{' '}
                  <span className="font-medium text-foreground">
                    welk risico je hebt weggenomen
                  </span>
                  , maar ook op{' '}
                  <span className="font-medium text-foreground">wie je bent op papier</span>. Dit is
                  een aparte multiplier op de leg-blend baseline.
                </>
              ) : (
                <>
                  Investors price pre-seed not only on{' '}
                  <span className="font-medium text-foreground">how much risk you've removed</span>,
                  but also on{' '}
                  <span className="font-medium text-foreground">who you are on paper</span>. This is
                  a separate multiplier on the leg-blend baseline.
                </>
              )}
            </p>
            <p className="mt-3 text-xs text-foreground/55">
              {locale === 'nl'
                ? 'Pick alleen wat je kunt onderbouwen — een investeerder verifieert elke claim.'
                : 'Only pick what you can defend — investors will verify every claim.'}
            </p>
          </div>
          <div
            className={cn(
              'shrink-0 rounded-xl px-4 py-3 text-center transition-colors',
              isLift
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : isDiscount
                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : 'bg-foreground/5 text-foreground/70'
            )}
          >
            <p className="text-[10px] uppercase tracking-wide opacity-75">
              {locale === 'nl' ? 'Pedigree-multiplier' : 'Pedigree multiplier'}
            </p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums">{multiplier.toFixed(2)}×</p>
            <p className="mt-1 text-[10px] opacity-65">
              {isLift && (locale === 'nl' ? 'Lift toegepast' : 'Lift applied')}
              {isDiscount && (locale === 'nl' ? 'Korting toegepast' : 'Discount applied')}
              {!isLift && !isDiscount && (locale === 'nl' ? 'Geen overlay' : 'No overlay')}
            </p>
          </div>
        </div>
      </div>

      {/* Qualification cards --------------------------------------- */}
      <div className="space-y-3">
        {PEDIGREE_KEYS.map((key) => {
          const copy = PEDIGREE_COPY[key]
          const checked = flags[key]
          const delta = PEDIGREE_DELTA_PCT[key]
          const isPenalty = delta < 0

          return (
            <motion.button
              key={key}
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => setFlag(key, !checked)}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'group block w-full rounded-2xl border p-5 text-left transition-all',
                'focus:outline-none focus:ring-2 focus:ring-primary/40',
                checked
                  ? isPenalty
                    ? 'border-amber-400 bg-amber-500/5 shadow-inner'
                    : 'border-primary bg-primary/5 shadow-inner'
                  : 'border-foreground/10 bg-background/60 hover:border-primary/40 hover:bg-primary/[0.03]'
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                    checked
                      ? isPenalty
                        ? 'border-amber-500 bg-amber-500'
                        : 'border-primary bg-primary'
                      : 'border-foreground/30 group-hover:border-primary/60'
                  )}
                >
                  {checked && (
                    <svg
                      className="h-3 w-3 text-background"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold text-foreground">
                      {copy.title[locale]}
                    </h3>
                    <span
                      className={cn(
                        'rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums',
                        isPenalty
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      )}
                    >
                      {formatDelta(delta)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground/70">
                    {copy.description[locale]}
                  </p>
                  <p className="mt-2 text-xs text-foreground/55">{copy.evidence[locale]}</p>
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>

      {/* Calibration footnote -------------------------------------- */}
      <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
        <p className="flex items-start gap-2 text-xs text-foreground/55">
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {locale === 'nl' ? (
              <>
                Calibratie: Strebulaev (Stanford GSB){' '}
                <span className="italic">Venture Mindset</span> 2024, Atomico SoEU 2024, Dealroom
                Benelux 2024. De multiplier is geclamped op{' '}
                <span className="font-medium text-foreground">0.70× – 1.80×</span> om niet-fundbare
                extremen te voorkomen.
              </>
            ) : (
              <>
                Calibration: Strebulaev (Stanford GSB){' '}
                <span className="italic">Venture Mindset</span> 2024, Atomico SoEU 2024, Dealroom
                Benelux 2024. The multiplier is clamped to{' '}
                <span className="font-medium text-foreground">0.70× – 1.80×</span> to keep the
                overlay inside the empirical envelope.
              </>
            )}
          </span>
        </p>
      </div>
    </div>
  )
}
