'use client'

import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import {
  computeSdePreviewMetrics,
  isSdeOwnerCompensationSectionComplete,
} from '@/lib/sde'
import { CurrencyInput } from '../CurrencyInput'
import { ValuationSectionHeader } from './ValuationSectionHeader'

interface SdeOwnerCompensationSectionProps {
  step: number
  ownerSalaryAddback?: number
  /** Latest complete historical year (revenue + EBITDA); used only to
   * resolve the section-complete checkmark via
   * `isSdeOwnerCompensationSectionComplete` and to surface engine
   * gating blockers (revenue cap / non-positive EBITDA).  No advisory
   * preview metrics are rendered here — that's the report's job. */
  revenue?: number
  ebitda?: number
  onFieldChange: (field: string, value: number | undefined) => void
  /**
   * Working owner = active operator, buyer must hire a replacement;
   * SDE add-back = excess compensation above market rate only.
   * Passive investor = non-operating shareholder, no replacement needed;
   * SDE add-back = full compensation (salary + benefits + dividend).
   */
  ownerRole?: 'working' | 'passive'
  onOwnerRoleChange?: (role: 'working' | 'passive') => void
  /** Number of active operator-owners. Drives engine owner-concentration
   * tier (1 = high key-person discount, ≥4 = low). */
  activeOwnersCount?: number
  onActiveOwnersCountChange?: (count: number) => void
  disabled?: boolean
}

export function SdeOwnerCompensationSection({
  step,
  ownerSalaryAddback,
  revenue,
  ebitda,
  onFieldChange,
  ownerRole,
  onOwnerRoleChange,
  activeOwnersCount,
  onActiveOwnersCountChange,
  disabled,
}: SdeOwnerCompensationSectionProps) {
  const t = useTranslations('manualInput.methodSelector')

  // Resolve the section-complete checkmark + extract any unavailable-reason
  // so we can render a gating blocker (NOT an advisory preview — those
  // metrics live in the SDE report).
  const preview = useMemo(
    () =>
      computeSdePreviewMetrics({
        revenue,
        ebitda,
        ownerSalaryAddback,
      }),
    [revenue, ebitda, ownerSalaryAddback]
  )

  const sectionComplete = useMemo(
    () => isSdeOwnerCompensationSectionComplete(ownerSalaryAddback, preview),
    [ownerSalaryAddback, preview]
  )

  const blockerMessage = useMemo(() => {
    if (preview.unavailableReason === 'revenue_cap') {
      return t('fields.sdeRevenueCapBlock')
    }
    if (preview.unavailableReason === 'non_positive_ebitda') {
      return t('fields.sdeNonPositiveEbitdaBlock')
    }
    return null
  }, [preview.unavailableReason, t])

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mt-6 space-y-4 pt-2"
    >
      <ValuationSectionHeader
        step={step}
        complete={sectionComplete}
        title={t('sections.sdeOwnerCompensation')}
      />

      {/* Engine gating blocker — surfaces only when the user's data
          puts them outside the SDE method's domain (revenue > €5M or
          non-positive EBITDA). NOT an advisory preview — just a
          deterministic eligibility signal so the user re-picks the
          method instead of getting silent garbage downstream. */}
      {blockerMessage ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{blockerMessage}</span>
          </div>
        </div>
      ) : null}

      {/* Owner-role radio — data input (the choice itself drives the
          add-back interpretation downstream).  One-line description per
          option restored 2026-05-10 so the user can choose without
          consulting the report. */}
      {onOwnerRoleChange ? (
        <fieldset className="rounded-xl border border-foreground/[0.08] bg-background px-3.5 py-3">
          <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/55">
            {t('fields.sdeOwnerRoleLabel')}
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1.5">
            {(
              [
                {
                  value: 'working' as const,
                  title: t('fields.sdeOwnerRoleWorking'),
                  desc: t('fields.sdeOwnerRoleWorkingDesc'),
                },
                {
                  value: 'passive' as const,
                  title: t('fields.sdeOwnerRolePassive'),
                  desc: t('fields.sdeOwnerRolePassiveDesc'),
                },
              ]
            ).map((opt) => {
              const selected = ownerRole === opt.value
              return (
                <label
                  key={opt.value}
                  className={`cursor-pointer rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    selected
                      ? 'border-primary/60 bg-primary/[0.06]'
                      : 'border-foreground/[0.08] hover:border-foreground/[0.18]'
                  } ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
                >
                  <input
                    type="radio"
                    name="sde-owner-role"
                    value={opt.value}
                    className="sr-only"
                    checked={selected}
                    disabled={disabled}
                    onChange={() => onOwnerRoleChange(opt.value)}
                  />
                  <span className="block text-[12px] font-semibold text-foreground/85">{opt.title}</span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-foreground/55">
                    {opt.desc}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="space-y-1.5">
        <CurrencyInput
          label={t('fields.ownerSalaryAddback')}
          value={ownerSalaryAddback}
          onChange={(v) => onFieldChange('owner_salary_addback', v)}
          size="sm"
          placeholder="45 000"
          disabled={disabled}
          truncateLabel={false}
        />
        <p className="text-[10.5px] leading-snug text-foreground/50 ml-1">
          {t('fields.ownerSalaryAddbackHelp')}
        </p>
      </div>

      {/* Active owners count — feeds engine owner-concentration tier
          (sde_channel.py: 1 owner → high key-person discount, ≥4 → low).
          Without this input the engine silently defaults to 1 → high
          discount and the multiple drops with no user-visible cause. */}
      {onActiveOwnersCountChange ? (
        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-foreground/55 ml-1">
            {t('fields.sdeActiveOwnersLabel')}
          </label>
          <input
            type="number"
            min={1}
            max={5}
            step={1}
            value={activeOwnersCount ?? 1}
            disabled={disabled}
            onChange={(e) => {
              const raw = parseInt(e.target.value, 10)
              const clamped = Number.isFinite(raw)
                ? Math.min(5, Math.max(1, raw))
                : 1
              onActiveOwnersCountChange(clamped)
            }}
            className="w-20 rounded-md border border-foreground/[0.12] bg-background px-2.5 py-1.5 text-sm text-foreground tabular-nums focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-60"
          />
          <p className="text-[10.5px] leading-snug text-foreground/50 ml-1">
            {t('fields.sdeActiveOwnersHelp')}
          </p>
        </div>
      ) : null}
    </motion.section>
  )
}
