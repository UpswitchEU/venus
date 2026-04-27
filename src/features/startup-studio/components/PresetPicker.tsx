'use client'

/**
 * PresetPicker
 * ------------
 *
 * One-click preset application surfaced at the top of the Profile step.
 *
 * The "blank canvas" problem is the single biggest source of friction in
 * the wizard: a founder lands on Step 0, faces 8 steps and ~30 inputs,
 * and stalls.  Picking a preset pre-fills a defensible baseline so the
 * founder can:
 *
 *   1. See a defensible pre-money number on first paint (zero cognitive load)
 *   2. Tune the inputs that actually differ from the typical case
 *   3. Skip the steps where the preset is right
 *
 * The Upswitch demo preset is special — it's the headline card and is
 * tagged so a downstream "Demo mode" badge can render across the wizard.
 */

import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useCallback } from 'react'
import {
  type PresetKey,
  STUDIO_PRESET_ORDER,
  STUDIO_PRESETS,
  type StudioPreset,
} from '@/features/startup-studio/data/presets'
import { cn } from '@/lib/utils'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'

const SESSION_KEY = 'upswitch.studio.applied_preset'

interface PresetPickerProps {
  locale?: 'en' | 'nl'
}

/**
 * Read the session-tagged "last applied preset" so the picker can render
 * the active state on remount.  Returns null on SSR / sessionStorage
 * disabled (Safari ITP, incognito) — the picker silently degrades to the
 * unselected state in that case.
 */
function readActivePreset(): PresetKey | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    if (raw in STUDIO_PRESETS) return raw as PresetKey
    return null
  } catch {
    return null
  }
}

function persistActivePreset(key: PresetKey | null): void {
  if (typeof window === 'undefined') return
  try {
    if (key) window.sessionStorage.setItem(SESSION_KEY, key)
    else window.sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore — session storage disabled
  }
}

export function PresetPicker({ locale = 'en' }: PresetPickerProps) {
  const applyPreset = useStartupValuationStore((s) => s.applyPreset)
  const updateFormData = useManualFormStore((s) => s.updateFormData)

  const handlePick = useCallback(
    (preset: StudioPreset) => {
      applyPreset(preset)
      // The Studio store ↔ Manual form-store bridge: company name is
      // owned by the Manual store (cf. ProfileStep:65) so the preset's
      // company_name is mirrored across the bridge here, not inside the
      // Studio applyPreset.
      if (preset.company_name) {
        updateFormData({ company_name: preset.company_name })
      }
      persistActivePreset(preset.key)
      // Fire-and-forget analytics — the picker doesn't await this.
      try {
        window.dispatchEvent(
          new CustomEvent('venus:preset_applied', { detail: { key: preset.key } })
        )
      } catch {
        // jsdom / older browsers — non-fatal
      }
    },
    [applyPreset, updateFormData]
  )

  const active = readActivePreset()

  return (
    <section
      aria-label={locale === 'nl' ? 'Snelle start templates' : 'Quick start templates'}
      className="rounded-2xl border border-foreground/10 bg-gradient-to-br from-primary/[0.04] via-background/60 to-background/60 p-6"
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            {locale === 'nl' ? 'Snelle start' : 'Quick start'}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            {locale === 'nl'
              ? 'Pre-fill een verdedigbare basis in 1 klik'
              : 'Pre-fill a defensible baseline in one click'}
          </h2>
          <p className="mt-1 text-sm text-foreground/65">
            {locale === 'nl'
              ? 'Kies een template — pas daarna alleen aan wat afwijkt van het typische geval.'
              : 'Pick a template — then tune only what differs from the typical case.'}
          </p>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {STUDIO_PRESET_ORDER.map((key) => {
          const preset = STUDIO_PRESETS[key]
          const isActive = active === key
          const isDemo = key === 'upswitch_demo'

          return (
            <motion.button
              key={key}
              type="button"
              onClick={() => handlePick(preset)}
              layout
              whileHover={{ y: -2 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'group relative rounded-xl border p-4 text-left transition-all',
                'focus:outline-none focus:ring-2 focus:ring-primary/40',
                isActive
                  ? 'border-primary bg-primary/[0.06] shadow-md'
                  : 'border-foreground/10 bg-background/80 hover:border-primary/40 hover:bg-primary/[0.03]',
                // Demo card is visually neutral (not primary-tinted) so a
                // founder valuing their OWN company doesn't accidentally
                // pick it thinking it's a template for them.
                isDemo && !isActive && 'opacity-90'
              )}
            >
              {/* Badge — Demo card uses a soft "Example" framing now,
                  not a primary call-out, so the visual hierarchy reads
                  "templates for you · plus an example for context". */}
              {preset.badge && (
                <span
                  className={cn(
                    'absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    isDemo
                      ? 'bg-foreground/10 text-foreground/70'
                      : 'bg-foreground/10 text-foreground/70'
                  )}
                >
                  {preset.badge[locale]}
                </span>
              )}

              {/* Active checkmark */}
              {isActive && (
                <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}

              <h3 className="pr-12 text-sm font-semibold text-foreground">
                {preset.title[locale]}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-foreground/65">
                {preset.subtitle[locale]}
              </p>

              <ul className="mt-3 flex flex-wrap gap-1.5">
                {preset.highlights[locale].map((tag) => (
                  <li
                    key={tag}
                    className="rounded-md bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium text-foreground/70"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            </motion.button>
          )
        })}
      </div>

      <p className="mt-4 text-[11px] text-foreground/55">
        {locale === 'nl'
          ? 'Een template overschrijft alleen de preset-velden — je vrije tekst blijft staan. Je kan altijd handmatig verder finetunen.'
          : 'Picking a template only overwrites preset-managed fields — your free text stays. Tune everything afterwards.'}
      </p>

    </section>
  )
}
