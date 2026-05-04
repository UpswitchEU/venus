'use client'

/**
 * SafeNotesEditor — shared "outstanding SAFE / convertible notes" list
 * editor.  Used by both the startup wizard's RoundSimulatorStep
 * (writes through to ``useStartupValuationStore.cap_table.safe_notes``)
 * and the SaaS method's CapitalHistorySection (writes through to
 * ``useManualFormStore.formData.capital_safe_notes``).
 *
 * Design discipline:
 *   - Pure presentational component.  No store reads, no I/O.
 *   - Generic over the parent's note shape via a minimal contract:
 *     ``{ id, holder_label, amount, valuation_cap, discount_pct }``.
 *     Anything more specific stays in the parent (e.g. provenance flags).
 *   - Stable list keys via the ``id`` field — required so both consumers
 *     keep React rows stable when the founder edits mid-row.
 *   - Every callback is fire-and-forget; the editor never blocks on
 *     async state.
 *
 * Visual contract: matches the Aurora-themed SAFE row used in the
 * Studio v2 wizard, so a founder running the SaaS method sees the same
 * UI primitive they'd see in the venture flow.
 */

import { Plus, Trash2 } from 'lucide-react'
import { CurrencyInput } from '@/components/calculator/CurrencyInput'
import { AdaptivePercentInput } from '@/components/calculator/sections/AdaptivePercentInput'
import { AuroraInput } from '@/design-system/components/Input'

export interface SafeNoteEditorRow {
  id: string
  holder_label?: string
  amount?: number | null
  valuation_cap?: number | null
  discount_pct?: number | null
}

export interface SafeNotesEditorProps<T extends SafeNoteEditorRow> {
  notes: T[]
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<T>) => void
  onRemove: (id: string) => void
  locale?: 'en' | 'nl'
  /** Optional title rendered in the header.  Falls back to a sensible default. */
  title?: string
  /** Optional sub-text rendered under the title. */
  description?: string
  /** Empty-state copy when no notes are present yet. */
  emptyHelper?: string
  /** Show the "most-favourable clause" hint at the bottom (advisor-only). */
  advisorMode?: boolean
}

export function SafeNotesEditor<T extends SafeNoteEditorRow>({
  notes,
  onAdd,
  onUpdate,
  onRemove,
  locale = 'en',
  title,
  description,
  emptyHelper,
  advisorMode = false,
}: SafeNotesEditorProps<T>) {
  const headerTitle = title ?? 'SAFE / Convertible notes'
  const headerDescription =
    description ??
    (locale === 'nl'
      ? 'Voeg openstaande SAFEs toe — ze converteren bij de volgende prijsronde.'
      : 'Add outstanding SAFEs — they convert at the next priced round.')
  const emptyText =
    emptyHelper ?? (locale === 'nl' ? 'Nog geen SAFEs toegevoegd.' : 'No SAFEs added yet.')

  return (
    <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{headerTitle}</h3>
          <p className="text-sm text-foreground/60">{headerDescription}</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-lg border border-foreground/15 bg-background px-3 py-2 text-xs font-medium text-foreground/80 transition hover:border-primary hover:bg-primary/5"
        >
          <Plus className="h-3.5 w-3.5" />
          SAFE
        </button>
      </div>

      {notes.length === 0 && (
        <p className="rounded-lg border border-dashed border-foreground/15 p-6 text-center text-xs text-foreground/55">
          {emptyText}
        </p>
      )}

      <div className="space-y-3">
        {notes.map((note) => (
          <div key={note.id} className="rounded-xl border border-foreground/10 bg-background p-4">
            <div className="mb-3 flex items-center justify-between">
              <AuroraInput
                label={locale === 'nl' ? 'Houder' : 'Holder'}
                value={note.holder_label ?? ''}
                onChange={(e) =>
                  onUpdate(note.id, {
                    holder_label: e.target.value.slice(0, 120),
                  } as Partial<T>)
                }
                placeholder="Angel #1"
                size="sm"
                maxLength={120}
                truncateLabel={false}
              />
              <button
                type="button"
                onClick={() => onRemove(note.id)}
                className="ml-3 rounded-lg p-2 text-foreground/55 transition hover:bg-red-500/10 hover:text-red-600"
                aria-label="Remove SAFE"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <CurrencyInput
                label="Amount (€)"
                value={note.amount ?? undefined}
                onChange={(value) =>
                  onUpdate(note.id, { amount: value ?? null } as Partial<T>)
                }
                placeholder="100.000"
                size="sm"
                truncateLabel={false}
              />
              <CurrencyInput
                label="Valuation cap (€)"
                value={note.valuation_cap ?? undefined}
                onChange={(value) =>
                  onUpdate(note.id, { valuation_cap: value ?? null } as Partial<T>)
                }
                placeholder="5.000.000"
                size="sm"
                truncateLabel={false}
              />
              <AdaptivePercentInput
                label={locale === 'nl' ? 'Discount (%)' : 'Discount (%)'}
                value={note.discount_pct ?? undefined}
                onChange={(value) =>
                  onUpdate(note.id, { discount_pct: value ?? null } as Partial<T>)
                }
                placeholder="20"
                size="sm"
                truncateLabel={false}
              />
            </div>
          </div>
        ))}
      </div>

      {advisorMode && (
        <p className="mt-4 rounded-lg bg-primary/5 p-3 text-[11px] text-foreground/70">
          {locale === 'nl'
            ? 'Advisor mode: bij conversie naar priced round wordt de meest gunstige clausule (cap of discount) per SAFE toegepast.'
            : 'Advisor mode: at priced-round conversion, the most-favorable clause (cap or discount) is applied per SAFE.'}
        </p>
      )}
    </div>
  )
}
