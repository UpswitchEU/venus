'use client'

import { AlertCircle, RotateCcw, Scale, TrendingUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyRemainderRebalance,
  equalWeightsFor,
  normalizeRemainderWeights,
  sanitizeSynthesisWeightDigits,
  usesRemainderWeightModel,
} from '@/constants/methodFieldConfig'
import { METHOD_LABEL_KEYS } from '@/constants/methodLabels'
import { AuroraButton } from '@/design-system/components/Button'
import { AuroraTextarea } from '@/design-system/components/Input'
import { cn } from '@/design-system/utils'
import type { ValuationMethodResult } from '@/types/valuation'
import { getValuationMethodResultForKey } from '@/utils/extractValuationResultsMap'
import { ValuationSectionHeader } from './ValuationSectionHeader'

function formatCompactCurrency(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}€${Math.round(abs / 1_000)}K`
  return `${sign}€${Math.round(abs)}`
}

function asDetailsRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function getDcfApvBridge(result: ValuationMethodResult | undefined | null) {
  const details = asDetailsRecord(result?.details)
  const taxShield = toFiniteNumber(details?.apv_tax_shield_value)
  if (taxShield == null || taxShield === 0) return null
  return {
    taxShield,
    valueBeforeBridge: toFiniteNumber(details?.dcf_equity_value_before_apv),
    convention:
      typeof details?.apv_discounting_convention === 'string'
        ? details.apv_discounting_convention
        : null,
  }
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

  const [editingMethod, setEditingMethod] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const cancelBlurCommitRef = useRef(false)

  useEffect(() => {
    if (editingMethod != null && !methods.includes(editingMethod)) {
      setEditingMethod(null)
    }
  }, [methods, editingMethod])

  useEffect(() => {
    if (disabled) {
      setEditingMethod(null)
    }
  }, [disabled])

  const rawSafeWeights = useMemo(() => {
    const w: Record<string, number> = {}
    for (const m of methods) {
      w[m] = weights[m] ?? 0
    }
    return w
  }, [weights, methods])

  const remainderModel = useMemo(() => usesRemainderWeightModel(methods), [methods])
  const remainderKey = remainderModel ? methods[methods.length - 1] : null

  const displayWeights = useMemo(() => {
    if (remainderModel) {
      return normalizeRemainderWeights(methods, rawSafeWeights)
    }
    return rawSafeWeights
  }, [methods, remainderModel, rawSafeWeights])

  useEffect(() => {
    if (disabled || !remainderModel || remainderKey == null) return
    const n = normalizeRemainderWeights(methods, rawSafeWeights)
    const outOfSync = methods.some((m) => (rawSafeWeights[m] ?? 0) !== (n[m] ?? 0))
    if (outOfSync) {
      onWeightsChange(n)
    }
  }, [disabled, methods, remainderModel, remainderKey, rawSafeWeights, onWeightsChange])

  const total = useMemo(
    () => methods.reduce((s, m) => s + (displayWeights[m] ?? 0), 0),
    [methods, displayWeights]
  )

  const hasResults = !!valuationResults && Object.keys(valuationResults).length > 0

  const liveBlended = useMemo(() => {
    if (!hasResults || total !== 100) return null
    let sum = 0
    let allAvailable = true
    for (const m of methods) {
      const mr = getValuationMethodResultForKey(valuationResults, m)
      const w = displayWeights[m] ?? 0
      if (w <= 0) continue
      if (!mr?.available || mr.value == null) {
        allAvailable = false
        continue
      }
      const add = Number(mr.value)
      if (!Number.isFinite(add)) {
        allAvailable = false
        continue
      }
      sum += add * (w / 100)
    }
    if (!allAvailable) return null
    return Number.isFinite(sum) && sum > 0 ? Math.round(sum) : null
  }, [hasResults, valuationResults, methods, displayWeights, total])

  const contributions = useMemo(() => {
    if (!hasResults) return null
    return methods.map((m) => {
      const mr = getValuationMethodResultForKey(valuationResults, m)
      const w = displayWeights[m] ?? 0
      const raw = mr?.available && mr.value != null ? Number(mr.value) : NaN
      const equity = Number.isFinite(raw) ? raw : null
      const apvBridge = m === 'dcf' ? getDcfApvBridge(mr) : null
      return {
        method: m,
        label: t(METHOD_LABEL_KEYS[m] ?? m),
        equity,
        weight: w,
        contribution: equity != null && w > 0 ? Math.round(equity * (w / 100)) : null,
        available: mr?.available ?? false,
        unavailableReason: mr?.unavailable_reason ?? null,
        apvBridge,
      }
    })
  }, [hasResults, valuationResults, methods, displayWeights, t])

  const contributionByMethod = useMemo(() => {
    if (!contributions) return null
    const map: Record<string, (typeof contributions)[number]> = {}
    for (const c of contributions) {
      map[c.method] = c
    }
    return map
  }, [contributions])

  const handleSliderChange = useCallback(
    (method: string, value: number) => {
      if (remainderModel && remainderKey != null && method === remainderKey) return
      const clamped = Math.min(100, Math.max(0, Math.round(value)))
      const rebalanced = applyRemainderRebalance(methods, displayWeights, method, clamped)
      onWeightsChange(rebalanced)
    },
    [methods, remainderModel, remainderKey, displayWeights, onWeightsChange]
  )

  const handleReset = useCallback(() => {
    setEditingMethod(null)
    onWeightsChange(equalWeightsFor(methods))
  }, [methods, onWeightsChange])

  const commitPercentInput = useCallback(
    (method: string, rawValue: string) => {
      if (remainderModel && remainderKey != null && method === remainderKey) return
      const trimmed = sanitizeSynthesisWeightDigits(rawValue)
      if (trimmed === '') return
      const parsed = Number.parseInt(trimmed, 10)
      if (Number.isNaN(parsed)) return
      const clamped = Math.min(100, Math.max(0, Math.round(parsed)))
      const rebalanced = applyRemainderRebalance(methods, displayWeights, method, clamped)
      onWeightsChange(rebalanced)
    },
    [methods, remainderModel, remainderKey, displayWeights, onWeightsChange]
  )

  const handlePercentFocus = useCallback(
    (method: string, currentW: number, el: HTMLInputElement | null) => {
      if (disabled) return
      if (remainderModel && remainderKey != null && method === remainderKey) return
      setEditingMethod(method)
      setDraft(String(currentW))
      requestAnimationFrame(() => el?.select())
    },
    [disabled, remainderModel, remainderKey]
  )

  const handlePercentBlur = useCallback(
    (method: string, rawValue: string) => {
      if (cancelBlurCommitRef.current) {
        cancelBlurCommitRef.current = false
        return
      }
      if (editingMethod !== method) return
      setEditingMethod(null)
      commitPercentInput(method, rawValue)
    },
    [editingMethod, commitPercentInput]
  )

  const handlePercentKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelBlurCommitRef.current = true
      setEditingMethod(null)
      e.currentTarget.blur()
    }
  }, [])

  const sectionRef = useRef<HTMLElement>(null)
  const hasScrolledRef = useRef(false)
  useEffect(() => {
    if (!hasScrolledRef.current && sectionRef.current && methods.length >= 2) {
      hasScrolledRef.current = true
      const timer = setTimeout(() => {
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [methods.length])

  if (methods.length < 2) return null

  return (
    <section ref={sectionRef} className="space-y-4" aria-label={synth('title')}>
      <div className="flex items-center justify-between">
        <ValuationSectionHeader step={step} title={synth('title')} complete={total === 100} />
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

      <div className="text-[12px] text-foreground/50 -mt-1 space-y-1">
        <p>{synth('subtitle')}</p>
        <p className="text-[11px] text-foreground/40">
          {remainderModel ? synth('subtitleHintRemainder') : synth('subtitleHint')}
        </p>
        {remainderModel && (
          <p className="text-[11px] text-foreground/40">{synth('remainderHint')}</p>
        )}
      </div>

      {/* Method sliders with optional live equity values */}
      <div className="space-y-3">
        {methods.map((method) => {
          const w = displayWeights[method] ?? 0
          const label = t(METHOD_LABEL_KEYS[method] ?? method)
          const contrib = contributionByMethod?.[method]
          const isRemainderRow = remainderModel && remainderKey != null && method === remainderKey

          return (
            <div key={method} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground/80 font-medium truncate mr-2">
                  {label}
                  {contrib?.apvBridge && (
                    <span className="ml-2 inline-flex align-middle rounded-full border border-primary/20 bg-primary/[0.07] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary/70">
                      {synth('apvBasis')}
                    </span>
                  )}
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
                  {isRemainderRow ? (
                    <div className="relative shrink-0">
                      <div
                        className={cn(
                          'w-[3.75rem] min-w-[3.75rem] rounded-lg border border-foreground/[0.08] bg-foreground/[0.03]',
                          'py-1 pl-2 pr-6 text-sm font-semibold tabular-nums text-foreground/55 text-right'
                        )}
                        aria-label={synth('ariaPercentInput', { methodName: label })}
                      >
                        {w}
                      </div>
                      <span
                        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-foreground/45 font-medium"
                        aria-hidden
                      >
                        %
                      </span>
                    </div>
                  ) : (
                    <div className="relative shrink-0">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        disabled={disabled}
                        value={editingMethod === method ? draft : String(w)}
                        onFocus={(e) => handlePercentFocus(method, w, e.currentTarget)}
                        onChange={(e) => {
                          if (editingMethod !== method) return
                          setDraft(sanitizeSynthesisWeightDigits(e.target.value))
                        }}
                        onBlur={(e) => handlePercentBlur(method, e.target.value)}
                        onKeyDown={handlePercentKeyDown}
                        aria-label={synth('ariaPercentInput', { methodName: label })}
                        className={cn(
                          'w-[3.75rem] min-w-[3.75rem] rounded-lg border border-foreground/[0.10] bg-foreground/[0.04]',
                          'py-1 pl-2 pr-6 text-sm font-semibold tabular-nums text-foreground/80 text-right',
                          'outline-none transition-colors',
                          'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20',
                          'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                      />
                      <span
                        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-foreground/45 font-medium"
                        aria-hidden
                      >
                        %
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isRemainderRow ? (
                  <div
                    className="flex-1 h-2 rounded-full bg-foreground/[0.06] overflow-hidden"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={w}
                    aria-valuetext={`${w}%`}
                    aria-label={synth('ariaWeightSlider', { methodName: label })}
                  >
                    <div className="h-full rounded-full bg-primary/50" style={{ width: `${w}%` }} />
                  </div>
                ) : (
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
                    aria-label={synth('ariaWeightSlider', { methodName: label })}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={w}
                    aria-valuetext={`${w}%`}
                  />
                )}
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

              {contrib?.apvBridge && w > 0 && (
                <div className="flex items-center justify-between gap-2 pr-0.5 text-[10px] text-foreground/45">
                  <span className="truncate">{synth('apvBridge')}</span>
                  <span className="shrink-0 tabular-nums font-mono text-foreground/55">
                    +{formatCompactCurrency(contrib.apvBridge.taxShield)}
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
        <div className="rounded-xl border border-foreground/[0.08] bg-card/[0.6] backdrop-blur-lg px-4 py-3 shadow-sm">
          <div className="flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-foreground/55" />
            <p className="text-[10px] text-foreground/55 uppercase tracking-wider font-medium">
              {synth('blendedValue')}
            </p>
          </div>
          <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-foreground/90">
            {formatCompactCurrency(liveBlended)}
          </p>
        </div>
      )}

      {/* Contributions breakdown table (post-calculation) */}
      {contributions && liveBlended != null && total === 100 && (
        <div className="rounded-lg border border-foreground/[0.06] bg-muted/30 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-foreground/[0.06]">
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-wider text-foreground/40"
                >
                  {synth('methodCol')}
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-right text-[9px] font-semibold uppercase tracking-wider text-foreground/40 whitespace-nowrap"
                >
                  {synth('valueCol')}
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-right text-[9px] font-semibold uppercase tracking-wider text-foreground/40"
                >
                  {synth('weight')}
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-[9px] font-semibold uppercase tracking-wider text-foreground/40 whitespace-nowrap"
                >
                  {synth('contributionCol')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/[0.04]">
              {contributions.map((c) => (
                <tr key={c.method} className={cn(!c.available && c.weight > 0 && 'opacity-50')}>
                  <td className="px-3 py-2 text-foreground/70 font-medium truncate max-w-[8rem]">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="truncate">{c.label}</span>
                      {c.apvBridge && (
                        <span className="shrink-0 rounded-full bg-primary/[0.08] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-primary/65">
                          {synth('apvBasis')}
                        </span>
                      )}
                    </div>
                    {c.apvBridge && (
                      <div className="mt-0.5 text-[9px] font-normal text-foreground/40">
                        {synth('apvBridge')} +{formatCompactCurrency(c.apvBridge.taxShield)}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-mono text-foreground/55 whitespace-nowrap">
                    {c.equity != null ? formatCompactCurrency(c.equity) : '—'}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-foreground/55 whitespace-nowrap">
                    {c.weight}%
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-mono font-medium text-foreground/70 whitespace-nowrap">
                    {c.contribution != null ? formatCompactCurrency(c.contribution) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-foreground/[0.08] bg-muted/40">
                <td className="px-3 py-2.5 font-semibold text-foreground/80">
                  {synth('blendedValue')}
                </td>
                <td />
                <td className="px-2 py-2.5 text-right tabular-nums text-foreground/50">100%</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-mono font-bold text-primary whitespace-nowrap">
                  {formatCompactCurrency(liveBlended)}
                </td>
              </tr>
            </tfoot>
          </table>
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
    </section>
  )
}
