'use client'

import { useTranslations } from 'next-intl'
import React, { memo } from 'react'
import type { OwnerProfilingChip } from '../../utils/ownerProfiling/coverChip'

function bandChrome(band: OwnerProfilingChip['colorBand']): { box: string; text: string } {
  switch (band) {
    case 'good':
      return {
        box: 'border-emerald-500/45 bg-emerald-500/15',
        text: 'text-emerald-950',
      }
    case 'caution':
      return {
        box: 'border-amber-500/50 bg-amber-500/15',
        text: 'text-amber-950',
      }
    case 'warn':
      return {
        box: 'border-red-600/45 bg-red-600/15',
        text: 'text-red-950',
      }
    case 'neutral':
    default:
      return {
        box: 'border-muted-foreground/40 bg-muted/40',
        text: 'text-foreground',
      }
  }
}

function adjPctRounded(adjustment: number): string {
  if (!Number.isFinite(adjustment)) return '0'
  return String(Math.round(adjustment * 100))
}

/** Defensive clamp — matches listings / coverChip contract (0–100). */
function clampTri(tri: number): number {
  return Math.min(100, Math.max(0, tri))
}

/** Canonical engine tokens → localized label; unknown wire values surface as-is. */
function localizedRiskDependencyLabel(
  canonicalRiskLevel: string,
  tBand: ReturnType<typeof useTranslations>
): string {
  const token = canonicalRiskLevel.trim().toUpperCase()
  switch (token) {
    case 'MINIMAL':
    case 'LOW':
    case 'MEDIUM':
    case 'HIGH':
    case 'CRITICAL':
      return tBand(`riskLevels.${token}`)
    default:
      return canonicalRiskLevel.trim()
  }
}

function OwnerProfilingReportChipInner({ chip }: { chip: OwnerProfilingChip }) {
  const t = useTranslations('reportPreview.ownerProfiling')
  const { box, text } = bandChrome(chip.colorBand)

  const tri = clampTri(chip.transferabilityRiskIndex)
  const riskLevel = localizedRiskDependencyLabel(chip.riskLevel, t)
  const mainAdj = chip.mode === 'capped' ? chip.appliedAdjustment : chip.adjustment
  const summary = t('summary', {
    tri,
    riskLevel,
    adjPct: adjPctRounded(mainAdj),
  })

  const cappedHint =
    chip.mode === 'capped' ? t('cappedHint', { rawPct: adjPctRounded(chip.rawAdjustment) }) : null

  const noteLabel =
    cappedHint !== null && cappedHint.trim() !== '' ? `${summary} ${cappedHint}` : summary

  return (
    <div
      className={`mt-0 inline-flex max-w-full flex-col gap-1 rounded-xl border px-3 py-2 text-left ${box}`}
      role="note"
      aria-label={noteLabel}
    >
      <p className={`text-[10px] font-semibold uppercase leading-snug tracking-wide ${text}`}>
        {summary}
      </p>
      {cappedHint ? (
        <p className="text-muted-foreground text-[11px] font-medium leading-snug">{cappedHint}</p>
      ) : null}
    </div>
  )
}

export const OwnerProfilingReportChip = memo(OwnerProfilingReportChipInner)
OwnerProfilingReportChip.displayName = 'OwnerProfilingReportChip'
