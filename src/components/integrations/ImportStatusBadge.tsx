'use client'

import { AlertCircle, Check, RefreshCw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { formatImportTime, normalizeImportTimeLocale } from './yukiIntegrationFormatters'
import type { ImportStatus } from './yukiIntegrationTypes'

export function ImportStatusBadge({
  status,
  lastImport,
}: {
  status: ImportStatus['status']
  lastImport?: Date
}) {
  const t = useTranslations('yukiIntegration')
  const locale = normalizeImportTimeLocale(useLocale())

  if (status === 'processing') {
    return (
      <div className="flex items-center gap-2 text-sm text-foreground/50">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span>{t('processing')}</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 text-sm text-secondary">
        <AlertCircle className="w-4 h-4" />
        <span>{t('importFailed')}</span>
      </div>
    )
  }

  if (status === 'imported' && lastImport) {
    return (
      <div className="flex items-center gap-2 text-sm text-primary">
        <Check className="w-4 h-4" />
        <span>{t('importedAgo', { time: formatImportTime(lastImport, t, locale) })}</span>
      </div>
    )
  }

  return null
}
