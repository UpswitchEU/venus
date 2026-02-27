'use client'

import { useTranslations } from 'next-intl'

export function ReportNotFoundMessage() {
  const t = useTranslations('errors.reportPage')

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground mb-4">{t('invalidUrl')}</h1>
        <p className="text-muted-foreground">{t('missingId')}</p>
      </div>
    </div>
  )
}
