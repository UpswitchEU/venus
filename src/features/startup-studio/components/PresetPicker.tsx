'use client'

/**
 * PresetPicker
 * ------------
 *
 * Compact one-click preset bar at the top of the company-card step.
 * Replaces the previous full-width-card grid (which dominated the panel
 * and dwarfed the actual company input).  The new shape is a small
 * label + horizontal chip strip — Aurora design system, low visual
 * weight, no headers / paragraphs / verbose subtitles.
 *
 * Picking a chip applies the preset diff to `useStartupValuationStore`
 * (via `applyPreset`) and mirrors `company_name` over to the Manual
 * form store so the canonical `buildStartupValuationRequest` picks it
 * up.
 */

import { Check } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'
import {
  type PresetKey,
  STUDIO_PRESET_ORDER,
  STUDIO_PRESETS,
  type StudioPreset,
} from '@/features/startup-studio/data/presets'
import { useBusinessTypes } from '@/hooks/useBusinessTypes'
import { cn } from '@/lib/utils'
import type { BusinessType } from '@/services/businessTypesApi'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import {
  type StartupSector,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'

/**
 * Studio sector → DB-business-type-category fallback map.  The DB
 * categories don't 1:1 mirror the Studio sector enum (the DB uses
 * generic verticals like `software` / `finance` / `healthcare`; the
 * Studio uses pre-revenue archetypes like `saas` / `fintech` /
 * `marketplace`), so we walk a two-step lookup:
 *
 *   1. Match by `keywords[]` containing the sector name (most precise).
 *   2. Fall back to the canonical category here.
 *
 * Picked categories are the closest DB equivalent for each pre-revenue
 * archetype the Studio surfaces.  Re-aim if Athena ships sector-native
 * categories for `marketplace` / `deeptech_ai` later.
 */
const SECTOR_TO_DB_CATEGORY: Record<StartupSector, string[]> = {
  saas: ['software', 'technology'],
  marketplace: ['ecommerce', 'retail', 'software'],
  fintech: ['finance', 'software'],
  biotech_healthtech: ['healthcare'],
  deeptech_ai: ['technology', 'software'],
  consumer: ['retail', 'ecommerce'],
  hardware: ['manufacturing'],
  other: ['services', 'other'],
}

/**
 * Resolve the best DB business-type id for a Studio sector — used by
 * the preset picker to seed `useManualFormStore.business_type_id` so
 * `buildStartupValuationRequest` packs a typed sector into the engine
 * envelope (not just the loose Studio enum).
 *
 * Returns `null` when the catalogue hasn't loaded yet OR no match
 * exists; the caller is expected to leave `business_type_id`
 * unchanged in that case (the BusinessTypeSearchInput is still the
 * authoritative way for the founder to pick / override).
 */
function resolveBusinessTypeIdForSector(
  sector: StartupSector,
  catalogue: BusinessType[]
): string | null {
  if (catalogue.length === 0) return null

  // Strategy 1: keyword match — the most precise.
  const sectorKeyword = sector.toLowerCase()
  const byKeyword = catalogue.find((bt) =>
    (bt.keywords ?? []).some((kw) => kw.toLowerCase().includes(sectorKeyword))
  )
  if (byKeyword) return byKeyword.id

  // Strategy 2: category fallback — first business type matching any
  // canonical category in `SECTOR_TO_DB_CATEGORY[sector]`.
  for (const candidateCategory of SECTOR_TO_DB_CATEGORY[sector] ?? []) {
    const byCategory = catalogue.find(
      (bt) => bt.category?.toLowerCase() === candidateCategory.toLowerCase()
    )
    if (byCategory) return byCategory.id
  }

  return null
}

const SESSION_KEY = 'upswitch.studio.applied_preset'

interface PresetPickerProps {
  /** @deprecated Ignored — route locale from next-intl is used. */
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

export function PresetPicker(_props: PresetPickerProps) {
  const locale = useLocale() === 'nl' ? 'nl' : 'en'
  const t = useTranslations('startupStudio.preset')
  const applyPreset = useStartupValuationStore((s) => s.applyPreset)
  const updateFormData = useManualFormStore((s) => s.updateFormData)
  // Subscribe to the canonical business-types catalogue so picking a
  // preset can seed `business_type_id` — without this bridge the
  // canonical engine envelope arrives without a typed sector and the
  // sector-specific multiples fall back to the Studio enum's coarser
  // mapping.
  const { businessTypes } = useBusinessTypes()
  const [active, setActive] = useState<PresetKey | null>(() => readActivePreset())

  const handlePick = useCallback(
    (preset: StudioPreset) => {
      applyPreset(preset)
      // The Studio store ↔ Manual form-store bridge.  Three updates:
      //   - `company_name` (Manual store owns the canonical identity)
      //   - `business_type_id` resolved from the preset's sector via
      //     keyword + category lookup against the live DB catalogue
      //   - `industry` derived from the matched business type's
      //     category, kept in sync for the engine's industry routing
      const updates: Record<string, unknown> = {}
      if (preset.company_name) updates.company_name = preset.company_name
      const resolvedBtId = resolveBusinessTypeIdForSector(preset.sector, businessTypes)
      if (resolvedBtId) {
        updates.business_type_id = resolvedBtId
        const matched = businessTypes.find((bt) => bt.id === resolvedBtId)
        if (matched?.category) updates.industry = matched.category
      }
      if (Object.keys(updates).length > 0) {
        updateFormData(updates)
      }
      persistActivePreset(preset.key)
      setActive(preset.key)
      // Fire-and-forget analytics — the picker doesn't await this.
      try {
        window.dispatchEvent(
          new CustomEvent('venus:preset_applied', { detail: { key: preset.key } })
        )
      } catch {
        // jsdom / older browsers — non-fatal
      }
    },
    [applyPreset, updateFormData, businessTypes]
  )

  return (
    <div
      aria-label={t('quickStartAria')}
      className="flex flex-wrap items-center gap-2"
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/55">
        {t('quickStart')}
      </span>
      {STUDIO_PRESET_ORDER.map((key) => {
        const preset = STUDIO_PRESETS[key]
        const isActive = active === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => handlePick(preset)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              isActive
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-foreground/10 bg-background/60 text-foreground/75 hover:border-primary/40 hover:bg-primary/[0.04]'
            )}
            title={preset.subtitle[locale]}
          >
            {isActive && <Check className="h-3 w-3" aria-hidden />}
            {preset.title[locale]}
          </button>
        )
      })}
    </div>
  )
}
