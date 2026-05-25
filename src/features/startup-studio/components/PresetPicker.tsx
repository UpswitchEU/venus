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
import { useCallback, useMemo, useState } from 'react'
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
import {
  businessTypeCategoryStrings,
  formatBusinessTypeCategory,
} from '@/utils/businessTypeCategory'

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
  vertical_ai: ['technology', 'software', 'services'],
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
export function resolveBusinessTypeIdForSector(
  sector: StartupSector,
  catalogue: BusinessType[]
): string | null {
  if (catalogue.length === 0) return null

  // Strategy 1: keyword match — the most precise.
  const sectorKeyword = sector.toLowerCase()
  const byKeyword = catalogue.find((bt) =>
    (bt.keywords ?? []).some(
      (kw) => typeof kw === 'string' && kw.toLowerCase().includes(sectorKeyword)
    )
  )
  if (byKeyword) return byKeyword.id

  // Strategy 2: category fallback — first business type matching any
  // canonical category in `SECTOR_TO_DB_CATEGORY[sector]`.
  for (const candidateCategory of SECTOR_TO_DB_CATEGORY[sector] ?? []) {
    const candidateKey = normalizeCategoryLookupKey(candidateCategory)
    const byCategory = catalogue.find((bt) =>
      businessTypeLookupCategories(bt).some((category) => category === candidateKey)
    )
    if (byCategory) return byCategory.id
  }

  return null
}

function normalizeCategoryLookupKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function businessTypeLookupCategories(bt: BusinessType): string[] {
  const categoryValues = [
    ...businessTypeCategoryStrings((bt as { category?: unknown }).category),
    (bt as { category_id?: unknown }).category_id,
    (bt as { industry?: unknown }).industry,
    (bt as { industryMapping?: unknown }).industryMapping,
  ]

  return [
    ...new Set(
      categoryValues
        .map((value) => normalizeCategoryLookupKey(value))
        .filter((value): value is string => value.length > 0)
    ),
  ]
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
  const reset = useStartupValuationStore((s) => s.reset)
  const updateFormData = useManualFormStore((s) => s.updateFormData)
  // Subscribe to the canonical business-types catalogue so picking a
  // preset can seed `business_type_id` — without this bridge the
  // canonical engine envelope arrives without a typed sector and the
  // sector-specific multiples fall back to the Studio enum's coarser
  // mapping.
  const { businessTypes } = useBusinessTypes()
  const [active, setActive] = useState<PresetKey | null>(() => readActivePreset())
  // Hover preview — surfaces what the chip will apply BEFORE click,
  // so the founder can scan three or four chips and pick the one that
  // matches their archetype without losing typed values to a wrong
  // pick. Closes the audit gap "presets give no preview of what they
  // apply." Mouse enter / focus sets; mouse leave / blur clears.
  const [hovered, setHovered] = useState<PresetKey | null>(null)
  // Locale-aware compact EUR formatter for the inline preview line.
  const intlPreviewFmt = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
        notation: 'compact',
        maximumFractionDigits: 1,
      }),
    [locale]
  )

  // A3 — clear-preset escape hatch. Once a founder picks a preset, the
  // sessionStorage tag pins the chip's active state and the Studio
  // store carries the preset's defaults. Without an explicit clear,
  // the only way back to a blank canvas was a hard reload + ?reset=1.
  // The clear chip resets the Studio store + clears the session tag
  // so a founder evaluating "let me look at the math, then start
  // fresh" path is fully supported.
  const handleClear = useCallback(() => {
    reset()
    persistActivePreset(null)
    setActive(null)
    try {
      window.dispatchEvent(new CustomEvent('venus:preset_cleared'))
    } catch {
      // jsdom / older browsers — non-fatal
    }
  }, [reset])

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
        if (matched?.category) {
          updates.industry = formatBusinessTypeCategory(matched.category, matched.category_id)
        }
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

  // Pick the preset to render the preview line for: hovered wins over
  // active so a hover always tells the user what THIS chip will apply
  // (not what the previous click stuck). Falls back to active so the
  // preview line stays useful after a click, until the next hover.
  const previewKey = hovered ?? active
  const previewPreset = previewKey ? STUDIO_PRESETS[previewKey] : null
  const previewMilestoneCount = previewPreset
    ? Object.values(previewPreset.maturity).filter((v) => v !== 'none').length
    : 0

  return (
    <div aria-label={t('quickStartAria')} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
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
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered((h) => (h === key ? null : h))}
              onFocus={() => setHovered(key)}
              onBlur={() => setHovered((h) => (h === key ? null : h))}
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
        {active && (
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-background/60 px-2.5 py-1 text-xs font-medium text-foreground/65 transition-colors hover:border-rose-300 hover:bg-rose-50/40 hover:text-rose-700 dark:hover:border-rose-700/40 dark:hover:bg-rose-950/30 dark:hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/40"
            title={t('clearTooltip')}
            aria-label={t('clearAria')}
          >
            <span aria-hidden>×</span>
            {t('clear')}
          </button>
        )}
      </div>

      {/* Inline preview — surfaces what the hovered chip will apply
          before the user commits. Tracks the active preset by default
          so a clicked-then-moved-mouse scenario keeps the relevant
          context visible. */}
      {previewPreset && (
        <div
          className="rounded-md border border-foreground/10 bg-foreground/[0.02] px-2.5 py-1.5 text-[11px] leading-snug text-foreground/65"
          aria-live="polite"
        >
          <span className="font-medium uppercase tracking-wide text-foreground/45">
            {t('previewLabel')}:
          </span>{' '}
          <span className="text-foreground/80">{previewPreset.title[locale]}</span>
          <span className="mx-1 text-foreground/35">·</span>
          {t('previewStage')} {previewPreset.stage}
          <span className="mx-1 text-foreground/35">·</span>
          {t('previewSector')} {previewPreset.sector}
          <span className="mx-1 text-foreground/35">·</span>
          {t('previewRaise')} €{intlPreviewFmt.format(previewPreset.investment_amount_sought)}
          {previewPreset.year5_revenue_projection != null && (
            <>
              <span className="mx-1 text-foreground/35">·</span>
              {t('previewY5')} €{intlPreviewFmt.format(previewPreset.year5_revenue_projection)}
            </>
          )}
          <span className="mx-1 text-foreground/35">·</span>
          {t('previewMilestones', { count: previewMilestoneCount })}
        </div>
      )}
    </div>
  )
}
