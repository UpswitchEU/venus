'use client'

/**
 * InceptionLensPicker — opt-in lens for the three pre-seed gaps
 * milestone-track methods miss.
 *
 * Pre-seed investing is more art than science.  The standard methodology
 * (Berkus + Scorecard + VC) systematically under-prices three founder
 * archetypes:
 *
 *   1. **Moat-blindness** — Scorecard penalises founders with no moat
 *      at the very stage where moats don't exist yet (Google '98, etc.)
 *   2. **TAM tyranny** — VC method anchors on Y5 ARR × multiple, which
 *      collapses for founders creating new markets (Shopify '08, Veeva)
 *   3. **Edge premium** — best founders cost more.  Owning 2% of a
 *      $5B+ outcome at $30M post is the bet shape (Anthropic, Lovable)
 *
 * Three opt-in levels.  Default is no-op so existing payloads round-trip
 * unchanged.  Higher levels lift the mid AND widen the band — honest
 * about increased variance, not just upside.
 *
 * Mirrors `apps/valuation-iq/src/domain/startup_valuation/inception_lens.py`.
 */

import { motion } from 'framer-motion'
import { Check, Compass } from 'lucide-react'
import {
  INCEPTION_LENS_ORDER,
  INCEPTION_LENS_OVERLAY,
  type InceptionLens,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import { cn } from '@/lib/utils'

interface InceptionLensPickerProps {
  locale?: 'en' | 'nl'
}

interface LensCopy {
  title: { en: string; nl: string }
  subtitle: { en: string; nl: string }
  examples?: { en: string; nl: string }
  defaultBadge?: { en: string; nl: string }
}

const LENS_COPY: Record<InceptionLens, LensCopy> = {
  milestones_driven: {
    title: { en: 'Milestones-driven', nl: 'Milestones-gedreven' },
    subtitle: {
      en: 'Standard pre-seed: measurable milestones, peer-comparable trajectory. Conventional Berkus + Scorecard + VC blend, no overlay.',
      nl: 'Standaard pre-seed: meetbare mijlpalen, peer-vergelijkbaar traject. Conventionele Berkus + Scorecard + VC blend, geen overlay.',
    },
    defaultBadge: { en: 'Default', nl: 'Default' },
  },
  momentum_driven: {
    title: { en: 'Momentum-driven', nl: 'Momentum-gedreven' },
    subtitle: {
      en: '"Pre-seed is won by momentum, not moats." Inbound investor interest, hiring acceleration, early customer pull. Lift +10%, ±15% wider variance band.',
      nl: '"Pre-seed wordt gewonnen door momentum, niet door moats." Inkomende investeerdersinteresse, versnelling van aanwervingen, vroege klantenvraag. Lift +10%, ±15% bredere band.',
    },
    examples: {
      en: 'Right when peers reach out unprompted; team scaling 2× per quarter; users asking for the next version.',
      nl: 'Wanneer peers ongevraagd uitreiken; team verdubbelt per kwartaal; gebruikers vragen om de volgende versie.',
    },
  },
  inception_bet: {
    title: { en: 'Inception bet', nl: 'Inception bet' },
    subtitle: {
      en: 'Edge premium + market-creation thesis. Spike profile, generational ambition, no ceiling. Lift +25%, ±25% wider variance band — high variance, asymmetric upside acknowledged honestly.',
      nl: 'Edge premie + markt-creatie thesis. Spike-profiel, generationele ambitie, geen plafond. Lift +25%, ±25% bredere band — hoge variantie, asymmetrische upside eerlijk erkend.',
    },
    examples: {
      en: 'The Lovable / Anthropic / Cursor profile. Borderline insane ambition, technical or distribution spike, market-creating thesis.',
      nl: 'Het Lovable / Anthropic / Cursor profiel. Bijna-krankzinnige ambitie, technisch of distributie spike, markt-creërende thesis.',
    },
  },
}

function formatPct(pct: number, sign = '+'): string {
  if (pct === 0) return '—'
  const intPct = Math.round(pct * 100)
  return `${sign}${intPct}%`
}

export function InceptionLensPicker({ locale = 'en' }: InceptionLensPickerProps) {
  const lens = useStartupValuationStore((s) => s.inception_lens)
  const setField = useStartupValuationStore((s) => s.setField)

  return (
    <section className="space-y-4 rounded-2xl border border-foreground/10 bg-background/60 p-6">
      <header>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Compass className="h-3.5 w-3.5 text-primary" />
          {locale === 'nl' ? 'Inception lens (optioneel)' : 'Inception lens (optional)'}
        </h2>
        <p className="mt-1 text-xs text-foreground/55">
          {locale === 'nl'
            ? 'Voor founders die niet op een conventioneel milestone-pad zitten. Erkent dat pre-seed wordt gewonnen door momentum, niet door moats — en dat de beste founders meer kosten. Standaard: uitgeschakeld.'
            : "For founders who aren't on a conventional milestone path. Acknowledges that pre-seed is won by momentum (not moats) and that the best founders cost more. Default: off."}
        </p>
      </header>

      <div className="space-y-3">
        {INCEPTION_LENS_ORDER.map((key) => {
          const copy = LENS_COPY[key]
          const overlay = INCEPTION_LENS_OVERLAY[key]
          const isActive = lens === key
          const isDefault = key === 'milestones_driven'

          return (
            <motion.button
              key={key}
              type="button"
              onClick={() => setField('inception_lens', key)}
              layout
              whileHover={{ y: -2 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'group relative w-full rounded-xl border p-4 text-left transition-all',
                'focus:outline-none focus:ring-2 focus:ring-primary/40',
                isActive
                  ? 'border-primary bg-primary/[0.06] shadow-md'
                  : 'border-foreground/10 bg-background/80 hover:border-primary/40 hover:bg-primary/[0.03]',
              )}
              aria-pressed={isActive}
            >
              {isDefault && copy.defaultBadge && !isActive && (
                <span className="absolute -top-2 right-3 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
                  {copy.defaultBadge[locale]}
                </span>
              )}
              {isActive && (
                <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}

              <div className="flex items-baseline justify-between gap-3 pr-6">
                <h3 className="text-sm font-semibold text-foreground">
                  {copy.title[locale]}
                </h3>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
                  {overlay.multiplier === 1
                    ? locale === 'nl'
                      ? 'Geen overlay'
                      : 'No overlay'
                    : `${formatPct(overlay.multiplier - 1)} · ±${Math.round(overlay.bandWidenPct * 100)}%`}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-foreground/65">
                {copy.subtitle[locale]}
              </p>
              {copy.examples && (
                <p className="mt-2 text-[11px] italic leading-relaxed text-foreground/50">
                  {copy.examples[locale]}
                </p>
              )}
            </motion.button>
          )
        })}
      </div>

      <p className="rounded-md bg-primary/[0.04] p-2.5 text-[11px] leading-relaxed text-foreground/65">
        {locale === 'nl' ? (
          <>
            <span className="font-medium text-foreground">Wat de lens doet:</span> tilt de
            mid (engine output) op én verbreedt de band (lower P10, higher P90). Eerlijk
            over verhoogde variantie — geen valse precisie. Canonieke wiskunde komt van
            ValuationIQ; deze lens is een gepubliceerde, peer-reviewed overlay (Hampus
            Jakobsson 2024 inception thesis, Atomico SoEU 2024).
          </>
        ) : (
          <>
            <span className="font-medium text-foreground">What the lens does:</span> lifts
            the mid (engine output) AND widens the band (lower P10, higher P90).  Honest
            about increased variance — no false precision.  Canonical math comes from
            ValuationIQ; this lens is a published, peer-reviewed overlay (Hampus Jakobsson
            2024 inception thesis, Atomico SoEU 2024).
          </>
        )}
      </p>
    </section>
  )
}
