'use client'

import { useTranslations } from 'next-intl'

export function LoadingState() {
  const t = useTranslations()
  
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-white">{t('common.states.loading')}</div>
    </div>
  )
}
