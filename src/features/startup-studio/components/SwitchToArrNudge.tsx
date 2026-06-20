'use client'

import { useTranslations } from 'next-intl'
import { useManualResultsStore } from '@/store/manual/useManualResultsStore'

interface SwitchToArrNudgeProps {
  tone: 'amber' | 'sky'
  text: string
}

export function SwitchToArrNudge({ tone, text }: SwitchToArrNudgeProps) {
  const t = useTranslations('startupStudio.companyCard')
  const setSelectedMethod = useManualResultsStore((s) => s.setSelectedMethod)
  const cls =
    tone === 'amber'
      ? 'border-amber-300/50 bg-amber-50/60 text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/25 dark:text-amber-200'
      : 'border-sky-300/50 bg-sky-50/60 text-sky-800 dark:border-sky-700/40 dark:bg-sky-950/25 dark:text-sky-200'
  const btnCls =
    tone === 'amber'
      ? 'border-amber-500 bg-amber-500 text-white hover:bg-amber-600'
      : 'border-sky-500 bg-sky-500 text-white hover:bg-sky-600'

  return (
    <div className={`mt-3 rounded-lg border p-3 text-[11px] leading-relaxed ${cls}`}>
      <p>{text}</p>
      <button
        type="button"
        onClick={() => setSelectedMethod('arr_multiple')}
        aria-label={t('switchToArrAria')}
        className={`mt-2 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${btnCls}`}
      >
        {t('switchToArrCta')}
      </button>
    </div>
  )
}
