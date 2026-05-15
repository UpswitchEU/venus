'use client'

import { useTranslations } from 'next-intl'
import { useNbbPrefillStore } from '../../../store/useNbbPrefillStore'

interface NbbResetHintProps {
  fiscalYear: string
  currentRevenue: number
  currentEbitda: number
  onReset: (field: 'revenue' | 'ebitda', value: number) => void
}

export function NbbResetHint({
  fiscalYear,
  currentRevenue,
  currentEbitda,
  onReset,
}: NbbResetHintProps) {
  const t = useTranslations('manualInput')
  const snap = useNbbPrefillStore((s) => s.getYearSnapshot(fiscalYear))
  if (!snap) return null

  const safeRev = Number.isFinite(currentRevenue) ? currentRevenue : null
  const safeEbitda = Number.isFinite(currentEbitda) ? currentEbitda : null
  const revDiffers =
    snap.revenue != null && (safeRev == null || Math.abs(safeRev - snap.revenue) > 0.01)
  const ebitdaDiffers =
    snap.ebitda != null && (safeEbitda == null || Math.abs(safeEbitda - snap.ebitda) > 0.01)

  if (!revDiffers && !ebitdaDiffers) return null

  return (
    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-blue-500">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
      <button
        type="button"
        onClick={() => {
          if (revDiffers && snap.revenue != null) onReset('revenue', snap.revenue)
          if (ebitdaDiffers && snap.ebitda != null) onReset('ebitda', snap.ebitda)
        }}
        className="underline underline-offset-2 hover:text-blue-600 transition-colors"
      >
        {t('resetToNbb')}
      </button>
    </div>
  )
}
