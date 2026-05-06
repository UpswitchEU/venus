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
 * Default-collapsed: Wintercircus founders without prior rounds skip it
 * in zero clicks.  The block has its own opt-in flag
 * (``capital_history_enabled``) so a founder who toggles it off can
 * keep their inputs in the form-store without them flowing to the
 * engine — same affordance the deal-structure section provides.
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
  locale?: 'en' | 'nl'
}

function generateSafeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `safe_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

export function CapitalHistorySection({ locale = 'en' }: CapitalHistorySectionProps) {
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
          <h3 className="text-base font-semibold text-foreground">
            {locale === 'nl' ? 'Funding tot nu toe' : 'Funding so far'}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-foreground/60">
            {locale === 'nl'
              ? 'Eerdere rondes, openstaande SAFEs en optiepool. Bepaalt de cap-tabel en verwatering in je rapport. Sla over als je nooit eerder hebt opgehaald.'
              : "Prior rounds, outstanding SAFEs, and the option pool. Drives the cap table + dilution in your report. Skip it if you've never raised before."}
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
          <SegmentedControl
            options={[
              {
                value: 'no',
                label: locale === 'nl' ? 'Eerste ronde' : 'First round',
              },
              {
                value: 'yes',
                label: locale === 'nl' ? 'Eerder kapitaal opgehaald' : 'Raised before',
              },
            ]}
            value={enabled ? 'yes' : 'no'}
            onChange={(value) => updateFormData({ capital_history_enabled: value === 'yes' })}
          />

          <CurrencyInput
            label={locale === 'nl' ? 'Op te halen ronde (€)' : 'Round being raised (€)'}
            value={roundAmount ?? undefined}
            onChange={(value) => updateFormData({ capital_round_amount: value ?? undefined })}
            placeholder="500.000"
            size="sm"
            truncateLabel={false}
            description={
              locale === 'nl'
                ? 'Drijft de "als ik €X ophaal, hoeveel verwater ik?" simulator op je rapport.'
                : 'Drives the "if I raise €X, what dilution do I take?" simulator on your report.'
            }
          />

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
                  label={locale === 'nl' ? 'Bestaande optiepool (%)' : 'Existing option pool (%)'}
                  value={optionPoolPct ?? undefined}
                  onChange={(value) =>
                    updateFormData({ capital_option_pool_pct: value ?? undefined })
                  }
                  placeholder="10"
                  size="sm"
                  truncateLabel={false}
                  description={
                    locale === 'nl'
                      ? 'Reeds gereserveerd voor toekomstige hires.'
                      : 'Already reserved for future hires.'
                  }
                />
                <CurrencyInput
                  label={
                    locale === 'nl' ? 'Vorige ronde — bedrag (€)' : 'Last round — amount (€)'
                  }
                  value={lastRoundAmount ?? undefined}
                  onChange={(value) =>
                    updateFormData({ capital_last_round_amount: value ?? undefined })
                  }
                  placeholder="250.000"
                  size="sm"
                  truncateLabel={false}
                  description={
                    locale === 'nl' ? 'Optioneel — historische context.' : 'Optional — historical context.'
                  }
                />
                <CurrencyInput
                  label={
                    locale === 'nl'
                      ? 'Vorige ronde — post-money (€)'
                      : 'Last round — post-money (€)'
                  }
                  value={lastRoundPostMoney ?? undefined}
                  onChange={(value) =>
                    updateFormData({ capital_last_round_post_money: value ?? undefined })
                  }
                  placeholder="2.500.000"
                  size="sm"
                  truncateLabel={false}
                />
                <input
                  type="date"
                  value={formData.capital_last_round_date ?? ''}
                  onChange={(e) =>
                    updateFormData({
                      capital_last_round_date: e.target.value || undefined,
                    })
                  }
                  className="block h-9 w-full rounded-md border border-foreground/15 bg-background px-3 text-sm text-foreground/85 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  aria-label={locale === 'nl' ? 'Datum vorige ronde' : 'Last round date'}
                />
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

export default CapitalHistorySection
