'use client'

import { useCallback, useMemo } from 'react'
import { RotateCcw, Scale, TrendingUp, AlertCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import { AuroraButton } from '@/design-system/components/Button'
import { AuroraTextarea } from '@/design-system/components/Input'
import { ValuationSectionHeader } from './ValuationSectionHeader'
import { equalWeightsFor } from '@/constants/methodFieldConfig'
import type { ValuationMethodResult } from '@/types/valuation'

const METHOD_LABEL_KEYS: Record<string, string> = {
  omzet_multiple: 'manualInput.methodSelector.revenueMultiple',
  revenue_multiple: 'manualInput.methodSelector.revenueMultiple',
  arr_multiple: 'manualInput.methodSelector.arrMultiple',
  ebitda_multiple: 'manualInput.methodSelector.ebitdaMultiple',
  dcf: 'manualInput.methodSelector.dcf',
  sde_multiple: 'manualInput.methodSelector.sdeMultiple',
  adjusted_nav: 'manualInput.methodSelector.adjustedNav',
  fiscal_4x: 'manualInput.methodSelector.fiscal4x',
}

function formatCompactCurrency(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}€${Math.round(abs / 1_000)}K`
  return `${sign}€${Math.round(abs)}`
}

function rebalanceWeights(
  weights: Record<string, number>,
  changedKey: string,
  newValue: number
): Record<string, number> {
  const keys = Object.keys(weights)
  const oldValue = weights[changedKey] ?? 0
  const delta = newValue - oldValue
  const otherKeys = keys.filter((k) => k !== changedKey)
  const otherSum = otherKeys.reduce((s, k) => s + weights[k], 0)

  const result: Record<string, number> = { ...weights, [changedKey]: newValue }

  if (otherSum === 0) {
    const share = Math.max(0, Math.round(-delta / otherKeys.length))
    otherKeys.forEach((k) => {
      result[k] = share
    })
  } else {
    otherKeys.forEach((k) => {
      result[k] = Math.max(0, Math.round(weights[k] - (delta * weights[k]) / otherSum))
    })
  }

  const total = Object.values(result).reduce((s, v) => s + v, 0)
  if (total !== 100 && otherKeys.length > 0) {
    const correction = 100 - total
    const maxKey = otherKeys.reduce((a, b) => (result[a] >= result[b] ? a : b))
    result[maxKey] = Math.max(0, result[maxKey] + correction)
  }

  return result
}

export interface SynthesisWeightingSectionProps {
  methods: string[]
  weights: Record<string, number>
  justification: string
  onWeightsChange: (weights: Record<string, number>) => void
  onJustificationChange: (justification: string) => void
  step: number
  disabled?: boolean
  valuationResults?: Record<string, ValuationMethodResult> | null
}

export function SynthesisWeightingSection({
  methods,
  weights,
  justification,
  onWeightsChange,
  onJustificationChange,
  step,
  disabled,
  valuationResults,
}: SynthesisWeightingSectionProps) {
  const t = useTranslations()
  const synth = useTranslations('manualInput.methodSelector.synthesis')

  const safeWeights = useMemo(() => {
    const w: Record<string, number> = {}
    for (const m of methods) {
      w[m] = weights[m] ?? 0
    }
    return w
  }, [weights, methods])

  const total = useMemo(
    () => methods.reduce((s, m) => s + (safeWeights[m] ?? 0), 0),
    [methods, safeWeights]
  )

  const hasResults = !!valuationResults && Object.keys(valuationResults).length > 0

  const liveBlended = useMemo(() => {
    if (!hasResults || total !== 100) return null
    let sum = 0
    let allAvailable = true
    for (const m of methods) {
      const mr = valuationResults?.[m]
      const w = safeWeights[m] ?? 0
      if (w <= 0) continue
      if (!mr?.available || mr.value == null) {
        allAvailable = false
        continue
      }
      sum += Number(mr.value) * (w / 100)
    }
    return allAvailable ? Math.round(sum) : null
  }, [hasResults, valuationResults, methods, safeWeights, total])

  const contributions = useMemo(() => {
    if (!hasResults) return null
    return methods.map((m) => {
      const mr = valuationResults?.[m]
      const w = safeWeights[m] ?? 0
      const equity = mr?.available && mr.value != null ? Number(mr.value) : null
      return {
        method: m,
        label: t(METHOD_LABEL_KEYS[m] ?? m),
        equity,
        weight: w,
        contribution: equity != null && w > 0 ? Math.round(equity * (w / 100)) : null,
        available: mr?.available ?? false,
        unavailableReason: mr?.unavailable_reason ?? null,
      }
    })
  }, [hasResults, valuationResults, methods, safeWeights, t])

  const handleSliderChange = useCallback(
    (method: string, value: number) => {
      const clamped = Math.min(100, Math.max(0, Math.round(value)))
      const rebalanced = rebalanceWeights(safeWeights, method, clamped)
      onWeightsChange(rebalanced)
    },
    [safeWeights, onWeightsChange]
  )

  const handleReset = useCallback(() => {
    onWeightsChange(equalWeightsFor(methods))
  }, [methods, onWeightsChange])

  if (methods.length < 2) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <ValuationSectionHeader
          step={step}
          title={synth('title')}
          complete={total === 100}
        />
        <AuroraButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={disabled}
          className="text-xs gap-1.5 text-foreground/50 hover:text-foreground"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {synth('resetEqual')}
        </AuroraButton>
      </div>

      <p className="text-[12px] text-foreground/50 -mt-1">
        {synth('subtitle')}
      </p>

      {/* Method sliders with optional live equity values */}
      <div className="space-y-3">
        {methods.map((method) => {
          const w = safeWeights[method] ?? 0
          const label = t(METHOD_LABEL_KEYS[method] ?? method)
          const contrib = contributions?.find((c) => c.method === method)

          return (
            <div key={method} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground/80 font-medium truncate mr-2">
                  {label}
                </span>
                <div className="flex items-center gap-2">
                  {contrib && contrib.equity != null && (
                    <span className="text-[11px] tabular-nums text-foreground/40 font-mono">
                      {formatCompactCurrency(contrib.equity)}
                    </span>
                  )}
                  {contrib && !contrib.available && w > 0 && (
                    <AlertCircle className="w-3 h-3 text-destructive/70" />
                  )}
                  <span className="tabular-nums text-foreground/60 font-semibold min-w-[3ch] text-right">
                    {w}%
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={w}
                  onChange={(e) => handleSliderChange(method, Number(e.target.value))}
                  disabled={disabled}
                  className={cn(
                    'flex-1 h-2 appearance-none rounded-full cursor-pointer',
                    'bg-foreground/[0.06]',
                    '[&::-webkit-slider-thumb]:appearance-none',
                    '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4',
                    '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary',
                    '[&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:border-2',
                    '[&::-webkit-slider-thumb]:border-background',
                    '[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110',
                    '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4',
                    '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary',
                    '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background',
                    disabled && 'opacity-50 cursor-not-allowed'
                  )}
                  style={{
                    background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${w}%, hsl(var(--foreground) / 0.06) ${w}%, hsl(var(--foreground) / 0.06) 100%)`,
                  }}
                  aria-label={`${label} ${synth('weight')}`}
                />
              </div>

              {/* Weighted contribution indicator (post-calculation) */}
              {contrib && contrib.contribution != null && w > 0 && (
                <div className="flex items-center justify-end gap-1.5 pr-0.5">
                  <TrendingUp className="w-3 h-3 text-primary/50" />
                  <span className="text-[10px] tabular-nums text-primary/60 font-medium font-mono">
                    {formatCompactCurrency(contrib.contribution)}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {total !== 100 && (
        <div className="text-xs text-destructive font-medium px-1">
          {synth('totalWarning', { total: String(total) })}
        </div>
      )}

      {/* Live blended valuation preview */}
      {liveBlended != null && total === 100 && (
        <div className="rounded-xl bg-gradient-to-r from-primary to-primary/90 p-4 text-center text-primary-foreground">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Scale className="w-3.5 h-3.5 text-primary-foreground/80" />
            <p className="text-[10px] text-primary-foreground/80 uppercase tracking-wider font-medium">
              {synth('blendedValue')}
            </p>
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums">
            {formatCompactCurrency(liveBlended)}
          </p>
        </div>
      )}

      {/* Contributions breakdown table (post-calculation) */}
      {contributions && liveBlended != null && total === 100 && (
        <div className="rounded-lg border border-foreground/[0.06] bg-muted/30 overflow-hidden">
          <div className="px-3 py-2 border-b border-foreground/[0.06]">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-[9px] font-semibold uppercase tracking-wider text-foreground/40">
              <span>{synth('methodCol')}</span>
              <span className="text-right min-w-[4.5rem]">{synth('valueCol')}</span>
              <span className="text-right min-w-[3rem]">{synth('weight')}</span>
              <span className="text-right min-w-[4.5rem]">{synth('contributionCol')}</span>
            </div>
          </div>
          <div className="divide-y divide-foreground/[0.04]">
            {contributions.map((c) => (
              <div
                key={c.method}
                className={cn(
                  'grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 text-[11px]',
                  !c.available && c.weight > 0 && 'opacity-50'
                )}
              >
                <span className="text-foreground/70 font-medium truncate">{c.label}</span>
                <span className="text-right tabular-nums font-mono text-foreground/55 min-w-[4.5rem]">
                  {c.equity != null ? formatCompactCurrency(c.equity) : '—'}
                </span>
                <span className="text-right tabular-nums text-foreground/55 min-w-[3rem]">
                  {c.weight}%
                </span>
                <span className="text-right tabular-nums font-mono font-medium text-foreground/70 min-w-[4.5rem]">
                  {c.contribution != null ? formatCompactCurrency(c.contribution) : '—'}
                </span>
              </div>
            ))}
          </div>
          <div className="px-3 py-2.5 border-t border-foreground/[0.08] bg-muted/40">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-[11px]">
              <span className="font-semibold text-foreground/80">{synth('blendedValue')}</span>
              <span />
              <span className="text-right tabular-nums text-foreground/50">100%</span>
              <span className="text-right tabular-nums font-mono font-bold text-primary min-w-[4.5rem]">
                {formatCompactCurrency(liveBlended)}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="pt-2 space-y-1.5">
        <label className="text-xs font-medium text-foreground/60">
          {synth('justificationLabel')}
        </label>
        <AuroraTextarea
          value={justification}
          onChange={(e) => onJustificationChange(e.target.value)}
          placeholder={synth('justificationPlaceholder')}
          rows={3}
          disabled={disabled}
          className="text-sm resize-none"
          maxLength={2000}
        />
      </div>
    </div>
  )
}
