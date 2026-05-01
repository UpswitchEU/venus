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

import { useState } from 'react'
import { CurrencyInput } from '@/components/calculator/CurrencyInput'
import { AdaptivePercentInput } from '@/components/calculator/sections/AdaptivePercentInput'
import { SafeNotesEditor } from '@/components/calculator/sections/SafeNotesEditor'
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
              description={
                locale === 'nl'
                  ? 'Leeg laten = onze blended waardering gebruiken. Alleen invullen als je al een pre-money met een lead investor hebt afgesproken.'
                  : "Leave blank to use our blended valuation. Only fill in if you've already agreed a pre-money with a lead investor."
              }
            />
            <AdaptivePercentInput
              label={
                locale === 'nl'
                  ? 'Totale verwatering tot exit (%)'
                  : 'Total dilution from now to exit (%)'
              }
              value={dilution ?? undefined}
              onChange={(value) => setField('dilution_assumption_pct', value ?? null)}
              placeholder="70"
              description={
                locale === 'nl'
                  ? 'Som van alle toekomstige rondes (deze + Seed + A + B + …). Typisch 70% voor Pre-seed → exit; 50% als je al bij Series A start.'
                  : 'Sum of every future round (this one + Seed + A + B + …). Typical: 70% from pre-seed → exit; 50% if you start at Series A.'
              }
            />
            <AdaptivePercentInput
              label={locale === 'nl' ? 'Option pool (%)' : 'Option pool (%)'}
              value={optionPoolPct}
              onChange={(value) => setCapField('option_pool_pct', value ?? 0)}
              placeholder="10"
              description={
                locale === 'nl'
                  ? 'Aandelen gereserveerd voor toekomstige hires — investeerders eisen meestal 10–15%.'
                  : 'Equity reserved for future hires — investors typically require 10–15%.'
              }
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
        <SafeNotesEditor
          notes={capTable.safe_notes}
          onAdd={addSafeNote}
          onUpdate={updateSafeNote}
          onRemove={removeSafeNote}
          locale={locale}
          advisorMode={advisorMode}
        />
      )}
    </div>
  )
}
