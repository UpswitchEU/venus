'use client'

import { AlertTriangle, Calculator, Percent } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import type { ValuationMethodResult, ValuationResponse } from '../../types/valuation'
import { MethodBreakdownDetails } from './ValuationEditModalBreakdownDetails'
import { buildMethodBreakdownModel } from './ValuationEditModalBreakdownModel'
import { formatCurrency } from './ValuationEditModalFormatting'

interface MethodBreakdownSectionProps {
  methodKey: string
  method: ValuationMethodResult | null
  result: ValuationResponse | null
  fiscalAnchor?: number | null
  benchmarkMultiple: number | null
  appliedMultiple: number | null
  previewEquity: number | null
}

export function MethodBreakdownSection({
  methodKey,
  method,
  result,
  fiscalAnchor,
  benchmarkMultiple,
  appliedMultiple,
  previewEquity,
}: MethodBreakdownSectionProps) {
  const tBreakdown = useTranslations('methodBreakdown')

  if (!method?.available) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-background/60 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/55">
          {tBreakdown('title')}
        </p>
        <p className="mt-1 text-[11px] leading-snug text-foreground/50">
          {tBreakdown('notAvailable')}
        </p>
      </div>
    )
  }

  const model = buildMethodBreakdownModel({ methodKey, method, result, appliedMultiple })

  return (
    <div className="rounded-lg border border-primary/15 bg-primary/[0.03] px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-primary/75">
        <Calculator className="w-3.5 h-3.5" />
        {tBreakdown('title')}
      </div>
      <p className="text-[11px] leading-snug text-foreground/55">
        {tBreakdown('subtitle', { method: method.label })}
      </p>
      {model.methodologyJustification && (
        <div className="rounded-lg border border-primary/15 bg-background/70 px-3 py-3">
          <p className="text-[11px] leading-snug text-foreground/65">
            {model.methodologyJustification}
          </p>
        </div>
      )}
      <MethodBreakdownDetails
        benchmarkMultiple={benchmarkMultiple}
        fiscalAnchor={fiscalAnchor}
        methodKey={methodKey}
        model={model}
        previewEquity={previewEquity}
      />
    </div>
  )
}

export function StakeCalculatorSection({ equityValue }: { equityValue: number | null }) {
  const tModal = useTranslations('valuationEditModal')
  const [stakePercent, setStakePercent] = useState(100)

  if (equityValue == null) return null

  const proRataValue = equityValue * (stakePercent / 100)
  const isPartial = stakePercent < 100 && stakePercent > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-foreground/55">
        <Percent className="w-3.5 h-3.5" aria-hidden />
        {tModal('stakeSection')}
      </div>
      <p className="text-[11px] leading-snug text-foreground/50">{tModal('stakeDescription')}</p>

      <div className="grid gap-1">
        <label
          className="text-[10px] font-medium text-foreground/45 uppercase"
          htmlFor="modal-stake-percent"
        >
          {tModal('stakeLabel')}
        </label>
        <input
          id="modal-stake-percent"
          type="number"
          step={0.01}
          min={1}
          max={100}
          value={stakePercent}
          onChange={(event) => {
            const value = parseFloat(event.target.value)
            if (Number.isFinite(value)) setStakePercent(Math.min(100, Math.max(1, value)))
          }}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono tabular-nums"
        />
        <input
          type="range"
          aria-label={tModal('stakeLabel')}
          min={1}
          max={100}
          step={1}
          value={Math.max(1, Math.round(stakePercent))}
          onChange={(event) => setStakePercent(parseFloat(event.target.value))}
          className="w-full h-2 mt-1 accent-primary"
        />
      </div>

      {isPartial && (
        <div className="rounded-md border border-amber-300/30 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0"
              aria-hidden
            />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              {tModal('stakeIndicative')}
            </span>
          </div>
          <p className="text-lg font-mono font-semibold tabular-nums text-amber-800 dark:text-amber-300">
            {formatCurrency(proRataValue)}
          </p>
          <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 leading-snug">
            {tModal('stakeFormula', {
              equity: formatCurrency(equityValue),
              percent: stakePercent.toFixed(2),
            })}
          </p>
          <p className="text-[10px] text-amber-600/70 dark:text-amber-500/70 leading-snug">
            {tModal('stakeDisclaimer')}
          </p>
        </div>
      )}
    </div>
  )
}
