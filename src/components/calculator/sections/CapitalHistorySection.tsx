'use client'

/**
 * CapitalHistorySection — collapsible "have you raised capital?" block
 * for the SaaS / non-startup valuation methods.  Drives the cap-table
 * simulator in the Mercury → Titan → ValuationIQ pipeline:
 *
 *   formData.capital_*  →  buildValuationRequest  →  request.cap_table +
 *   request.investment_amount_sought  →  Titan DTO  →  Python engine →
 *   MethodResult.details.cap_table_simulator  →  React simulator + PDF.
 *
 * The block has its own opt-in flag (``capital_history_enabled``) so a
 * founder who toggles it off can keep their inputs in the form-store
 * without them flowing to the engine — same affordance the
 * deal-structure section provides.
 *
 * UX rules pinned by the SaaS UI audit (2026-05-10):
 *   - All copy goes through next-intl (no inline locale ternaries).
 *   - Toggle reads "Have you raised capital before this round?" so
 *     founders never confuse "First round" with "your current round".
 *   - "Round being raised" lives ABOVE the toggle as the
 *     always-required primary input — the toggle only gates the
 *     prior-rounds disclosure.
 *   - The last-round date sits in a labelled wrapper matching its
 *     siblings (no raw `<input type="date">` floating in the grid).
 *
 * Persistence: writes through to ``useManualFormStore``.  The
 * ``capital_safe_notes`` array uses stable client-side IDs so React
 * keys stay deterministic across renders; the ID is stripped at the
 * Mercury → Titan boundary by the request builder.
 */

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CurrencyInput } from '@/components/calculator/CurrencyInput'
import { AdaptivePercentInput } from '@/components/calculator/sections/AdaptivePercentInput'
import { SafeNotesEditor } from '@/components/calculator/sections/SafeNotesEditor'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import type { SafeNoteInput } from '@/types/valuation'
import { consumeCapitalHistoryPrefill } from '@/utils/capitalHistoryPrefill'

interface CapitalHistorySectionProps {
  /** @deprecated Locale comes from next-intl route locale. Kept for
   *  backwards-compat with any test harness that passes it explicitly. */
  locale?: 'en' | 'nl'
}

function generateSafeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `safe_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

export function CapitalHistorySection(_props: CapitalHistorySectionProps) {
  const t = useTranslations('manualInput.methodSelector.capitalHistory')
  const tSafe = useTranslations('startupStudio.safeNotes')
  const formData = useManualFormStore((s) => s.formData)
  const updateFormData = useManualFormStore((s) => s.updateFormData)

  const enabled = Boolean(formData.capital_history_enabled)
  const roundAmount = formData.capital_round_amount
  const optionPoolPct = formData.capital_option_pool_pct
  const safeNotes = useMemo<SafeNoteInput[]>(
    () => formData.capital_safe_notes ?? [],
    [formData.capital_safe_notes],
  )
  const lastRoundAmount = formData.capital_last_round_amount
  const lastRoundPostMoney = formData.capital_last_round_post_money

  // Default-expanded on the SaaS path: this section only mounts when
  // the SaaS valuation method is selected, and a Series A founder
  // running an ARR multiple almost always has prior rounds to declare.
  // Keeping it collapsed-by-default produced "I didn't know that
  // existed" feedback during the first Wintercircus founder test runs.
  const [expanded, setExpanded] = useState<boolean>(true)

  const prefillConsumedRef = useRef(false)
  // Optional one-shot SaaS prefill (sessionStorage).  If nothing writes
  // the snapshot before mount, this silently no-ops.
  useEffect(() => {
    if (prefillConsumedRef.current) return
    prefillConsumedRef.current = true
    const prefill = consumeCapitalHistoryPrefill()
    if (!prefill) return
    const current = useManualFormStore.getState().formData
    const patch: Partial<typeof current> = {}
    if (
      prefill.round_amount != null &&
      (current.capital_round_amount === undefined || current.capital_round_amount === null)
    ) {
      patch.capital_round_amount = prefill.round_amount
    }
    if (Object.keys(patch).length > 0) {
      updateFormData(patch as Record<string, unknown>)
    }
    // ``dilution_pct`` is not yet wired into the SaaS form-store; the
    // snapshot keeps the field for forward compatibility (a future
    // dilution-to-exit hint above the cap-table simulator card will
    // pull from this same channel without a second migration).
  }, [updateFormData])

  // ── SAFE editor handlers ──────────────────────────────────────────
  const handleAddSafe = useCallback(() => {
    const next: SafeNoteInput = {
      id: generateSafeId(),
      amount: null,
      valuation_cap: null,
      discount_pct: 20,
      holder_label: '',
    }
    updateFormData({ capital_safe_notes: [...safeNotes, next] })
  }, [safeNotes, updateFormData])

  const handleUpdateSafe = useCallback(
    (id: string, patch: Partial<SafeNoteInput>) => {
      updateFormData({
        capital_safe_notes: safeNotes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      })
    },
    [safeNotes, updateFormData],
  )

  const handleRemoveSafe = useCallback(
    (id: string) => {
      updateFormData({
        capital_safe_notes: safeNotes.filter((n) => n.id !== id),
      })
    },
    [safeNotes, updateFormData],
  )

  return (
    <section className="rounded-2xl border border-foreground/10 bg-background/60">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 p-5 text-left"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground">{t('sectionTitle')}</h3>
          <p className="mt-1 text-xs leading-relaxed text-foreground/60">
            {t('sectionDescription')}
          </p>
        </div>
        <ChevronDown
          className={[
            'h-4 w-4 shrink-0 text-foreground/55 transition-transform',
            expanded ? 'rotate-180' : 'rotate-0',
          ].join(' ')}
        />
      </button>

      {expanded && (
        <div className="space-y-5 border-t border-foreground/10 px-5 pb-5 pt-5">
          {/* Always-required primary input — sits ABOVE the toggle so
              first-round founders never read "First round" + "Round
              being raised" as a contradiction. */}
          <CurrencyInput
            label={t('roundLabel')}
            value={roundAmount ?? undefined}
            onChange={(value) => updateFormData({ capital_round_amount: value ?? undefined })}
            placeholder="500.000"
            size="sm"
            truncateLabel={false}
            description={t('roundDescription')}
          />

          {/* Toggle gates ONLY the prior-rounds disclosure block. */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/55">
              {t('haveRaisedQuestion')}
            </p>
            <SegmentedControl
              options={[
                { value: 'no', label: t('haveRaisedNo') },
                { value: 'yes', label: t('haveRaisedYes') },
              ]}
              value={enabled ? 'yes' : 'no'}
              onChange={(value) => updateFormData({ capital_history_enabled: value === 'yes' })}
            />
          </div>

          {enabled && (
            <>
              <SafeNotesEditor
                notes={safeNotes}
                onAdd={handleAddSafe}
                onUpdate={handleUpdateSafe}
                onRemove={handleRemoveSafe}
                title={tSafe('capitalHistoryTitle')}
                description={tSafe('capitalHistoryDescription')}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <AdaptivePercentInput
                  label={t('optionPoolLabel')}
                  value={optionPoolPct ?? undefined}
                  onChange={(value) =>
                    updateFormData({ capital_option_pool_pct: value ?? undefined })
                  }
                  placeholder="10"
                  size="sm"
                  truncateLabel={false}
                  description={t('optionPoolDescription')}
                />
                <CurrencyInput
                  label={t('lastRoundAmountLabel')}
                  value={lastRoundAmount ?? undefined}
                  onChange={(value) =>
                    updateFormData({ capital_last_round_amount: value ?? undefined })
                  }
                  placeholder="250.000"
                  size="sm"
                  truncateLabel={false}
                  description={t('lastRoundAmountDescription')}
                />
                <CurrencyInput
                  label={t('lastRoundPostMoneyLabel')}
                  value={lastRoundPostMoney ?? undefined}
                  onChange={(value) =>
                    updateFormData({ capital_last_round_post_money: value ?? undefined })
                  }
                  placeholder="2.500.000"
                  size="sm"
                  truncateLabel={false}
                />
                {/* Date input wrapped in a labelled block matching its
                    siblings (no raw `<input>` floating in the grid). */}
                <div>
                  <label
                    htmlFor="capital-last-round-date"
                    className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-foreground/55"
                  >
                    {t('lastRoundDateLabel')}
                  </label>
                  <input
                    id="capital-last-round-date"
                    type="date"
                    value={formData.capital_last_round_date ?? ''}
                    onChange={(e) =>
                      updateFormData({
                        capital_last_round_date: e.target.value || undefined,
                      })
                    }
                    className="block h-9 w-full rounded-md border border-foreground/15 bg-background px-3 text-sm text-foreground/85 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <p className="mt-1 text-[11px] leading-relaxed text-foreground/55">
                    {t('lastRoundDateDescription')}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

export default CapitalHistorySection
