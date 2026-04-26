'use client'

/**
 * TeamPicker — single 4-bucket plain-language replacement for the 6
 * founder-pedigree checkboxes.
 *
 * The Express valuation flow targets owners.  Six dense checkboxes about
 * "top-tier scaleup alumni (≥2 years, IC4+ equivalent)" or "10+ years
 * industry experience" make a non-finance founder reach for Claude.
 * This component asks ONE question — "How experienced is your team?" —
 * with four cards every founder can answer in 5 seconds.
 *
 * The 6 explicit pedigree flags still exist on the store and remain
 * visible inside the Advanced disclosure for advisors / auditors who
 * want defensible per-claim provenance.  The bucket → flag-set mapping
 * lives in `data/teamLevel.ts` so the engine math is unchanged.
 */

import { motion } from 'framer-motion'
import { Check, Users } from 'lucide-react'
import { useMemo } from 'react'
import {
  TEAM_LEVEL_COPY,
  TEAM_LEVEL_ORDER,
  type TeamLevel,
  getTeamLevelFlags,
  inferTeamLevel,
} from '@/features/startup-studio/data/teamLevel'
import {
  PEDIGREE_KEYS,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import { cn } from '@/lib/utils'

interface TeamPickerProps {
  locale?: 'en' | 'nl'
}

export function TeamPicker({ locale = 'en' }: TeamPickerProps) {
  const flags = useStartupValuationStore((s) => s.founder_pedigree)
  const setPedigreeFlag = useStartupValuationStore((s) => s.setPedigreeFlag)

  const active = useMemo(() => inferTeamLevel(flags), [flags])

  const handlePick = (level: TeamLevel) => {
    const next = getTeamLevelFlags(level)
    // Apply each flag through the canonical setter so the existing
    // mutual-exclusion invariant (solo ↔ technical cofounder) keeps
    // firing.  This is a write-through, not a state replacement.
    for (const key of PEDIGREE_KEYS) {
      setPedigreeFlag(key, next[key])
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-foreground/10 bg-background/60 p-6">
      <header>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Users className="h-3.5 w-3.5 text-primary" />
          {locale === 'nl' ? 'Hoe ervaren is je team?' : 'How experienced is your team?'}
        </h2>
        <p className="mt-1 text-xs text-foreground/55">
          {locale === 'nl'
            ? 'Eén pick. Geen vakjargon. We rekenen de bijhorende founder-pedigree multiplier zelf uit.'
            : "One pick. No jargon. We compute the founder-pedigree multiplier from this — no checkboxes to read."}
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {TEAM_LEVEL_ORDER.map((level) => {
          const copy = TEAM_LEVEL_COPY[level]
          const isActive = active === level
          const isRecommended = level === 'experienced'

          return (
            <motion.button
              key={level}
              type="button"
              onClick={() => handlePick(level)}
              layout
              whileHover={{ y: -2 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'group relative flex h-full flex-col rounded-xl border p-4 text-left transition-all',
                'focus:outline-none focus:ring-2 focus:ring-primary/40',
                isActive
                  ? 'border-primary bg-primary/[0.06] shadow-md'
                  : 'border-foreground/10 bg-background/80 hover:border-primary/40 hover:bg-primary/[0.03]',
              )}
              aria-pressed={isActive}
            >
              {isRecommended && !isActive && (
                <span className="absolute -top-2 right-3 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  {locale === 'nl' ? 'Meest gekozen' : 'Most picked'}
                </span>
              )}
              {isActive && (
                <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}

              <h3 className="pr-8 text-sm font-semibold text-foreground">{copy.title[locale]}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-foreground/65">
                {copy.subtitle[locale]}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-foreground/45">
                {copy.hint[locale]}
              </p>
            </motion.button>
          )
        })}
      </div>

      <p className="text-[11px] text-foreground/45">
        {locale === 'nl'
          ? 'Niet zeker? Kies "Ervaren operators" — dat is de Atomico Benelux pre-seed mediaan.'
          : 'Not sure? Pick "Experienced operators" — it\'s the Atomico Benelux pre-seed median.'}
      </p>
    </section>
  )
}
