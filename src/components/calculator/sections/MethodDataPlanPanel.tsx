'use client'

/**
 * BET-325 — adaptive left-panel surface for the agent's per-method data-input plan.
 *
 * Renders, read-only and informationally, what the owner/advisor still needs to
 * collect to unlock or firm up each weighted valuation method (`fieldsToCollect`),
 * plus the three BET-312 autofill "doors" (connect-accounting / invite-accountant /
 * registry-estimate). The doors are **feature-detected**: until
 * `FEATURE_FLAGS.BET312_AUTOFILL_DOORS` is on (i.e. BET-312 ships the routing) they
 * render greyed and disabled with a "coming soon" badge.
 *
 * Dormant by contract: the plan only reaches the store when
 * `ADAPTIVE_METHOD_AGENT_MODE` is shadow/primary AND the agent has proposed a blend
 * (see Titan `getSession` read-enrichment + `SessionRestorationService` hydration).
 * Absent plan → this renders `null`, never an empty shell.
 */

import { ArrowRight, Building2, FileText, Sparkles, UserPlus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { isBet312AutofillDoorsEnabled } from '@/config/features'
import { METHOD_LABEL_KEYS } from '@/constants/methodLabels'
import type { MethodWeightsDataPlan } from '@/types/methodDataPlan'

interface MethodDataPlanPanelProps {
  methodDataPlan: MethodWeightsDataPlan | null
}

/** Engine field/method keys → readable labels when no i18n key exists (informational). */
function prettifyKey(key: string): string {
  return key
    .replace(/[_.]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim()
}

export function MethodDataPlanPanel({ methodDataPlan }: MethodDataPlanPanelProps) {
  const mi = useTranslations('manualInput')
  const tMethodSelector = useTranslations('manualInput.methodSelector')

  // Dormant by default: no plan (agent off / no proposal) → render nothing.
  if (!methodDataPlan || methodDataPlan.perMethod.length === 0) return null

  const getMethodLabel = (key: string): string => {
    const path = METHOD_LABEL_KEYS[key]
    if (!path) return prettifyKey(key)
    const short = path.replace('manualInput.methodSelector.', '') as Parameters<
      typeof tMethodSelector
    >[0]
    return tMethodSelector(short)
  }

  const doorsAvailable = isBet312AutofillDoorsEnabled()
  // Only methods still missing inputs are actionable; the rest are already unlocked.
  const methodsNeedingInput = methodDataPlan.perMethod.filter(
    (entry) => entry.fieldsToCollect.length > 0
  )

  const doors = [
    { key: 'connectAccounting', icon: Building2, label: mi('methodDataPlan.doors.connectAccounting') },
    { key: 'inviteAccountant', icon: UserPlus, label: mi('methodDataPlan.doors.inviteAccountant') },
    { key: 'registryEstimate', icon: FileText, label: mi('methodDataPlan.doors.registryEstimate') },
  ]

  return (
    <section
      aria-label={mi('methodDataPlan.title')}
      className="rounded-xl border border-foreground/[0.08] bg-muted/20 p-4"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/60">
          {mi('methodDataPlan.title')}
        </h3>
      </div>
      <p className="mt-1 text-[11px] text-foreground/50">{mi('methodDataPlan.subtitle')}</p>

      {methodsNeedingInput.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {methodsNeedingInput.map((entry) => (
            <li key={entry.method} className="rounded-lg bg-foreground/[0.03] p-3">
              <div className="text-xs font-medium text-foreground/80">
                {getMethodLabel(entry.method)}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {entry.fieldsToCollect.map((field) => (
                  <span
                    key={field}
                    className="rounded-md border border-foreground/[0.08] bg-foreground/[0.04] px-2 py-0.5 text-[11px] text-foreground/60"
                  >
                    {prettifyKey(field)}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[11px] text-foreground/50">{mi('methodDataPlan.allUnlocked')}</p>
      )}

      {methodDataPlan.unlockHint && (
        <p className="mt-3 text-[11px] leading-relaxed text-foreground/55">
          {methodDataPlan.unlockHint}
        </p>
      )}

      {/* BET-312 autofill doors — greyed "coming soon" until the routing lands. */}
      <div className="mt-4 border-t border-foreground/[0.06] pt-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/40">
            {mi('methodDataPlan.doorsTitle')}
          </span>
          {!doorsAvailable && (
            <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium text-foreground/40">
              {mi('methodDataPlan.comingSoon')}
            </span>
          )}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {doors.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              disabled={!doorsAvailable}
              aria-disabled={!doorsAvailable}
              className={`group flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-[11px] transition-colors ${
                doorsAvailable
                  ? 'cursor-pointer border-foreground/15 bg-muted/30 text-foreground/70 hover:bg-muted/50'
                  : 'cursor-not-allowed border-foreground/10 bg-muted/20 text-foreground/40'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="flex-1">{label}</span>
              {doorsAvailable && (
                <ArrowRight
                  className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
