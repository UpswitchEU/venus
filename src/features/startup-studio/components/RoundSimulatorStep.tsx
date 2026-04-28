'use client'

/**
 * Step 5 — Round Simulator.
 *
 * SAFE vs priced-round toggle.  When SAFE → renders the SAFE notes
 * list (advisor mode).  When priced → renders the live cap-table preview:
 *
 *   founders / option-pool / new investor split  given
 *     - investment_amount_sought
 *     - dilution_assumption_pct
 *     - option_pool_pct
 *     - blended pre-money (from `useLiveValuation`)
 */

import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CurrencyInput } from '@/components/calculator/CurrencyInput'
import { AdaptivePercentInput } from '@/components/calculator/sections/AdaptivePercentInput'
import { AuroraInput } from '@/design-system/components/Input'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { formatEur, useLiveValuation } from '@/features/startup-studio/hooks/useLiveValuation'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'

interface RoundSimulatorStepProps {
  locale?: 'en' | 'nl'
  advisorMode?: boolean
}

type RoundType = 'priced' | 'safe'

export function RoundSimulatorStep({
  locale = 'en',
  advisorMode = false,
}: RoundSimulatorStepProps) {
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const { benchmark } = useStartupBenchmark(country, stage, sector)
  const valuation = useLiveValuation(benchmark)
  const investment = useStartupValuationStore((s) => s.investment_amount_sought)
  const dilution = useStartupValuationStore((s) => s.dilution_assumption_pct)
  const setField = useStartupValuationStore((s) => s.setField)
  const capTable = useStartupValuationStore((s) => s.cap_table)
  const setCapField = useStartupValuationStore((s) => s.setCapField)
  const addSafeNote = useStartupValuationStore((s) => s.addSafeNote)
  const updateSafeNote = useStartupValuationStore((s) => s.updateSafeNote)
  const removeSafeNote = useStartupValuationStore((s) => s.removeSafeNote)

  const [roundType, setRoundType] = useState<RoundType>(
    capTable.safe_notes.length > 0 ? 'safe' : 'priced'
  )

  // Cap-table math (priced round) ------------------------------------
  const preMoney = capTable.pre_money_target ?? valuation.blended?.mid ?? 0
  const postMoney = preMoney + (investment ?? 0)
  const newInvestorPct = postMoney > 0 && investment ? (investment / postMoney) * 100 : 0
  const optionPoolPct = capTable.option_pool_pct ?? 0
  const foundersPct = Math.max(0, 100 - newInvestorPct - optionPoolPct)

  return (
    <div className="space-y-5">
      {/* Round-type toggle ------------------------------------------ */}
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <h3 className="mb-1 text-lg font-semibold text-foreground">
          {locale === 'nl' ? 'Welk soort ronde haal je op?' : 'What kind of round are you raising?'}
        </h3>
        <p className="mb-4 text-sm text-foreground/60">
          {locale === 'nl'
            ? 'SAFE notes converteren bij de volgende prijsronde — de cap-tabel wordt dan herberekend.'
            : 'SAFEs convert at the next priced round — the cap table is recalculated then.'}
        </p>

        <SegmentedControl
          options={[
            { value: 'priced', label: locale === 'nl' ? 'Priced round' : 'Priced round' },
            { value: 'safe', label: 'SAFE / convertible' },
          ]}
          value={roundType}
          onChange={setRoundType}
        />
      </div>

      {/* Round inputs ----------------------------------------------- */}
      {roundType === 'priced' && (
        <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <CurrencyInput
              label={locale === 'nl' ? 'Op te halen ronde (€)' : 'Round size to raise (€)'}
              value={investment ?? undefined}
              onChange={(value) => setField('investment_amount_sought', value ?? null)}
              placeholder="500.000"
              size="sm"
            />
            <CurrencyInput
              label={
                locale === 'nl'
                  ? 'Pre-money target (€) — optioneel'
                  : 'Pre-money target (€) — optional'
              }
              value={capTable.pre_money_target ?? undefined}
              onChange={(value) => setCapField('pre_money_target', value ?? null)}
              placeholder={String(Math.round(valuation.blended?.mid ?? 0))}
              size="sm"
            />
            <AdaptivePercentInput
              label={locale === 'nl' ? 'Verwatering tot exit (%)' : 'Dilution to exit (%)'}
              value={dilution ?? undefined}
              onChange={(value) => setField('dilution_assumption_pct', value ?? null)}
              placeholder="30"
            />
            <AdaptivePercentInput
              label={locale === 'nl' ? 'Option pool (%)' : 'Option pool (%)'}
              value={optionPoolPct}
              onChange={(value) => setCapField('option_pool_pct', value ?? 0)}
              placeholder="10"
            />
          </div>

          {/* Live cap-table bar -------------------------------------- */}
          <div className="mt-6">
            <p className="mb-2 text-[10px] uppercase tracking-wide text-foreground/55">
              {locale === 'nl' ? 'Cap-tabel post-money' : 'Cap table post-money'}
            </p>
            <div className="flex h-10 w-full overflow-hidden rounded-lg border border-foreground/10">
              <div
                className="flex items-center justify-center bg-emerald-500/80 text-[11px] font-semibold text-white"
                style={{ width: `${foundersPct}%` }}
                title={`Founders: ${foundersPct.toFixed(1)}%`}
              >
                {foundersPct >= 8 && `${foundersPct.toFixed(0)}%`}
              </div>
              <div
                className="flex items-center justify-center bg-amber-500/80 text-[11px] font-semibold text-white"
                style={{ width: `${optionPoolPct}%` }}
                title={`Option pool: ${optionPoolPct.toFixed(1)}%`}
              >
                {optionPoolPct >= 8 && `${optionPoolPct.toFixed(0)}%`}
              </div>
              <div
                className="flex items-center justify-center bg-primary text-[11px] font-semibold text-white"
                style={{ width: `${newInvestorPct}%` }}
                title={`New investor: ${newInvestorPct.toFixed(1)}%`}
              >
                {newInvestorPct >= 8 && `${newInvestorPct.toFixed(0)}%`}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-foreground/65">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500/80" />
                {locale === 'nl' ? 'Founders' : 'Founders'} {foundersPct.toFixed(1)}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500/80" />
                Option pool {optionPoolPct.toFixed(1)}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary" />
                {locale === 'nl' ? 'Nieuwe investeerder' : 'New investor'}{' '}
                {newInvestorPct.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-primary/5 p-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-foreground/55">Pre-money</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {formatEur(preMoney)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-foreground/55">Post-money</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {formatEur(postMoney)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SAFE notes editor ------------------------------------------ */}
      {roundType === 'safe' && (
        <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">SAFE / Convertible notes</h3>
              <p className="text-sm text-foreground/60">
                {locale === 'nl'
                  ? 'Voeg openstaande SAFEs toe — ze converteren bij de volgende prijsronde.'
                  : 'Add outstanding SAFEs — they convert at the next priced round.'}
              </p>
            </div>
            <button
              type="button"
              onClick={addSafeNote}
              className="flex items-center gap-1.5 rounded-lg border border-foreground/15 bg-background px-3 py-2 text-xs font-medium text-foreground/80 transition hover:border-primary hover:bg-primary/5"
            >
              <Plus className="h-3.5 w-3.5" />
              SAFE
            </button>
          </div>

          {capTable.safe_notes.length === 0 && (
            <p className="rounded-lg border border-dashed border-foreground/15 p-6 text-center text-xs text-foreground/55">
              {locale === 'nl' ? 'Nog geen SAFEs toegevoegd.' : 'No SAFEs added yet.'}
            </p>
          )}

          <div className="space-y-3">
            {capTable.safe_notes.map((note) => (
              <div
                key={note.id}
                className="rounded-xl border border-foreground/10 bg-background p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <AuroraInput
                    label={locale === 'nl' ? 'Houder' : 'Holder'}
                    value={note.holder_label}
                    onChange={(e) =>
                      updateSafeNote(note.id, { holder_label: e.target.value.slice(0, 120) })
                    }
                    placeholder="Angel #1"
                    size="sm"
                    maxLength={120}
                  />
                  <button
                    type="button"
                    onClick={() => removeSafeNote(note.id)}
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
                    onChange={(value) => updateSafeNote(note.id, { amount: value ?? null })}
                    placeholder="100.000"
                    size="sm"
                  />
                  <CurrencyInput
                    label="Valuation cap (€)"
                    value={note.valuation_cap ?? undefined}
                    onChange={(value) => updateSafeNote(note.id, { valuation_cap: value ?? null })}
                    placeholder="5.000.000"
                    size="sm"
                  />
                  <AdaptivePercentInput
                    label={locale === 'nl' ? 'Discount (%)' : 'Discount (%)'}
                    value={note.discount_pct ?? undefined}
                    onChange={(value) => updateSafeNote(note.id, { discount_pct: value ?? null })}
                    placeholder="20"
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
      )}
    </div>
  )
}
