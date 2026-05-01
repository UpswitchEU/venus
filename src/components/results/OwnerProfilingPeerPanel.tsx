'use client'

/**
 * Venus report-side Owner Profiling peer panel (DATA-1, full-circle UX).
 *
 * Mirror of Mercury's `OwnerProfilingPeerPanel` — same 4-band
 * classification, same privacy contract, same fail-closed render. Lives
 * in Venus because the report renders here; Mercury surfaces the wizard
 * panel right after submit.
 *
 * Render contract:
 *   - When `userTri` is null OR the benchmark is unavailable, renders
 *     `null`. We never show a "no peers yet" banner — that would leak
 *     cohort size and break the k-anon guarantee.
 *   - The fetch lives in a useEffect, not TanStack Query, to match the
 *     existing Venus pattern in `Results.tsx`. Each call dedupes on the
 *     `(businessTypeId, countryCode)` key via abort-on-unmount.
 *
 * SPIKE-1 §5.4: never display the user's own raw owner_dependency
 * adjustment alongside the peer cohort numbers — the cover chip owns
 * that. This panel is sector-comparison only.
 */

import { useTranslations } from 'next-intl'
import { memo, useCallback, useEffect, useRef, useState } from 'react'

import {
  type VenusOwnerProfileBenchmark,
  fetchOwnerProfilePeerBenchmark,
} from '../../utils/ownerProfiling/fetchPeerBenchmark'
import { withdrawAnonymizedContribution } from '../../utils/ownerProfiling/withdrawContribution'

export interface OwnerProfilingPeerPanelProps {
  businessTypeId: string | null | undefined
  countryCode: string | null | undefined
  /** User's transferability index (0..100), derived from coverChip. */
  userTri: number | null | undefined
  /**
   * The originating valuation_id. Required for withdrawal — Venus pins
   * `contributor_reference = valuation_id` at submit time. When null,
   * the withdraw affordance hides (e.g. on shared anonymous links
   * without a known valuation).
   */
  valuationId?: string | null | undefined
}

type WithdrawState =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'submitting' }
  | { kind: 'done'; status: 'withdrawn' | 'already_withdrawn' | 'not_found' }
  | { kind: 'error'; message: string }

type Band = 'below_p25' | 'between_p25_p50' | 'between_p50_p75' | 'above_p75'

function classifyBand(userTri: number, bench: VenusOwnerProfileBenchmark): Band {
  if (userTri < bench.tri.p25) return 'below_p25'
  if (userTri < bench.tri.p50) return 'between_p25_p50'
  if (userTri < bench.tri.p75) return 'between_p50_p75'
  return 'above_p75'
}

type Tone = 'warn' | 'caution' | 'good' | 'excellent'

function bandTone(band: Band): Tone {
  switch (band) {
    case 'below_p25':
      return 'warn'
    case 'between_p25_p50':
      return 'caution'
    case 'between_p50_p75':
      return 'good'
    case 'above_p75':
      return 'excellent'
  }
}

function chrome(tone: Tone): { box: string; accent: string; label: string } {
  switch (tone) {
    case 'excellent':
      return {
        box: 'border-emerald-500/45 bg-emerald-500/10',
        accent: 'text-emerald-700',
        label: 'text-emerald-900',
      }
    case 'good':
      return {
        box: 'border-emerald-500/30 bg-emerald-500/5',
        accent: 'text-emerald-700',
        label: 'text-emerald-900',
      }
    case 'caution':
      return {
        box: 'border-amber-500/40 bg-amber-500/10',
        accent: 'text-amber-700',
        label: 'text-amber-900',
      }
    case 'warn':
      return {
        box: 'border-red-600/40 bg-red-600/10',
        accent: 'text-red-700',
        label: 'text-red-900',
      }
  }
}

function OwnerProfilingPeerPanelInner({
  businessTypeId,
  countryCode,
  userTri,
  valuationId,
}: OwnerProfilingPeerPanelProps) {
  const t = useTranslations('reportPreview.ownerProfilingPeer')
  const [benchmark, setBenchmark] = useState<VenusOwnerProfileBenchmark | null>(null)
  const [withdraw, setWithdraw] = useState<WithdrawState>({ kind: 'idle' })
  const withdrawAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!businessTypeId || !countryCode || countryCode.length !== 2) {
      setBenchmark(null)
      return
    }
    const controller = new AbortController()
    let mounted = true
    fetchOwnerProfilePeerBenchmark({
      businessTypeId,
      countryCode,
      signal: controller.signal,
    })
      .then((result) => {
        if (mounted) setBenchmark(result)
      })
      .catch(() => {
        if (mounted) setBenchmark(null)
      })
    return () => {
      mounted = false
      controller.abort()
    }
  }, [businessTypeId, countryCode])

  // Abort any in-flight withdrawal when the panel unmounts so a slow
  // request can't fire setWithdraw on a dead component.
  useEffect(
    () => () => {
      withdrawAbortRef.current?.abort()
      withdrawAbortRef.current = null
    },
    [],
  )

  const onWithdrawClick = useCallback(() => {
    setWithdraw({ kind: 'confirming' })
  }, [])

  const onCancelWithdraw = useCallback(() => {
    setWithdraw({ kind: 'idle' })
  }, [])

  const onConfirmWithdraw = useCallback(async () => {
    if (!valuationId) return
    setWithdraw({ kind: 'submitting' })
    const controller = new AbortController()
    withdrawAbortRef.current = controller
    try {
      const result = await withdrawAnonymizedContribution({
        valuationId,
        signal: controller.signal,
      })
      setWithdraw({ kind: 'done', status: result.status })
    } catch (err) {
      if (controller.signal.aborted) return
      setWithdraw({
        kind: 'error',
        message:
          err instanceof Error && err.message.includes('Authentication')
            ? t('withdrawErrorAuth')
            : t('withdrawErrorGeneric'),
      })
    } finally {
      if (withdrawAbortRef.current === controller) {
        withdrawAbortRef.current = null
      }
    }
  }, [valuationId, t])

  // Fail closed when we can't classify — same render path as no-benchmark,
  // never a "we couldn't compare" message that would leak the gap.
  if (!benchmark || typeof userTri !== 'number' || !Number.isFinite(userTri)) {
    return null
  }

  const userTriBounded = Math.min(100, Math.max(0, Math.round(userTri)))
  const band = classifyBand(userTriBounded, benchmark)
  const c = chrome(bandTone(band))

  const comparisonText = t(`comparison.${band}`, {
    you: userTriBounded,
    median: benchmark.tri.p50,
  })

  return (
    <section
      aria-labelledby="venus-owner-profiling-peer-heading"
      className={`rounded-xl border ${c.box} px-4 py-4`}
    >
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h3
          id="venus-owner-profiling-peer-heading"
          className={`text-sm font-semibold uppercase tracking-wide ${c.label}`}
        >
          {t('heading')}
        </h3>
        <span className="text-xs text-foreground/55">
          {t('cohortSize', { n: benchmark.n })}
        </span>
      </header>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-foreground/55">
            {t('p25')}
          </div>
          <div className={`text-lg font-bold tabular-nums ${c.accent}`}>
            {benchmark.tri.p25}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-foreground/55">
            {t('median')}
          </div>
          <div className={`text-2xl font-extrabold tabular-nums ${c.label}`}>
            {benchmark.tri.p50}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-foreground/55">
            {t('p75')}
          </div>
          <div className={`text-lg font-bold tabular-nums ${c.accent}`}>
            {benchmark.tri.p75}
          </div>
        </div>
      </div>

      <p className={`mt-3 text-sm leading-relaxed ${c.label}`}>{comparisonText}</p>
      <p className="mt-2 text-[11px] text-foreground/45">{t('privacyNote')}</p>

      {/* Withdraw affordance. Hidden when no valuationId (anonymous shared
          link surfaces) or when withdrawal is already complete. The
          confirmation flow is inline + minimal — a full modal would
          dominate this small surface and break the report flow. */}
      {valuationId && withdraw.kind !== 'done' ? (
        <div className="mt-3 border-t border-foreground/10 pt-2">
          {withdraw.kind === 'idle' ? (
            <button
              type="button"
              onClick={onWithdrawClick}
              className="text-[11px] text-foreground/55 underline-offset-2 hover:text-foreground/80 hover:underline"
            >
              {t('withdrawCta')}
            </button>
          ) : null}

          {withdraw.kind === 'confirming' ? (
            <div className="flex flex-col gap-2 text-[11px] text-foreground/70 sm:flex-row sm:items-center sm:justify-between">
              <span>{t('withdrawConfirmPrompt')}</span>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={onConfirmWithdraw}
                  className="rounded border border-red-600/40 bg-red-600/10 px-2 py-1 font-medium text-red-700 hover:bg-red-600/20"
                >
                  {t('withdrawConfirm')}
                </button>
                <button
                  type="button"
                  onClick={onCancelWithdraw}
                  className="rounded border border-foreground/20 px-2 py-1 text-foreground/70 hover:bg-foreground/[0.04]"
                >
                  {t('withdrawCancel')}
                </button>
              </span>
            </div>
          ) : null}

          {withdraw.kind === 'submitting' ? (
            <span className="text-[11px] text-foreground/55">
              {t('withdrawSubmitting')}
            </span>
          ) : null}

          {withdraw.kind === 'error' ? (
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-red-700">{withdraw.message}</span>
              <button
                type="button"
                onClick={onCancelWithdraw}
                className="text-foreground/55 underline-offset-2 hover:text-foreground/80 hover:underline"
              >
                {t('withdrawCancel')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {withdraw.kind === 'done' ? (
        <div
          role="status"
          className="mt-3 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-900"
        >
          {withdraw.status === 'withdrawn' ? t('withdrawDone') : t('withdrawAlreadyDone')}
        </div>
      ) : null}
    </section>
  )
}

export const OwnerProfilingPeerPanel = memo(OwnerProfilingPeerPanelInner)
OwnerProfilingPeerPanel.displayName = 'VenusOwnerProfilingPeerPanel'
