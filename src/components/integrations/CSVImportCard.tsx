'use client'

import { AlertCircle, Download, FileSpreadsheet, RefreshCw, Upload } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Badge } from '@/design-system/components/Badge'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { GlassCard } from '@/design-system/components/GlassCard'
import { Body, Caption, Heading } from '@/design-system/components/Typography'
import { cn } from '@/design-system/utils'
import { formatImportTime, normalizeImportTimeLocale } from './yukiIntegrationFormatters'
import type { CSVImportCardProps } from './yukiIntegrationTypes'

const SOFTWARE_COLORS: Record<NonNullable<CSVImportCardProps['softwareName']>, string> = {
  Yuki: '#00A4E4',
  Exact: '#E94E1B',
  Odoo: '#714B67',
  Octopus: '#2D7DD2',
  Accountable: '#10B981',
  Generiek: 'hsl(var(--primary))',
}

export function CSVImportCard({
  importStatus,
  onUpload,
  onDownloadTemplate,
  onClearImport,
  className,
  softwareName = 'Generiek',
}: CSVImportCardProps) {
  const t = useTranslations('yukiIntegration')
  const locale = normalizeImportTimeLocale(useLocale())
  const { status, lastImport, fileName, errorMessage } = importStatus
  const color = SOFTWARE_COLORS[softwareName]

  return (
    <GlassCard className={cn('p-6', className)}>
      <div className="flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}15` }}
        >
          <FileSpreadsheet className="w-6 h-6" style={{ color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Heading level={3} className="text-lg">
              {t('exportLabel', { software: softwareName })}
            </Heading>
            {status === 'imported' && (
              <Badge variant="primary" size="sm">
                {t('importedBadge')}
              </Badge>
            )}
            {status === 'error' && (
              <Badge variant="accent" size="sm">
                {t('errorBadge')}
              </Badge>
            )}
          </div>

          {status === 'none' && (
            <Body size="sm" className="text-foreground/50 mb-4">
              {t('uploadHint')}
            </Body>
          )}

          {status === 'processing' && (
            <Body size="sm" className="text-foreground/50 mb-4">
              {t('processing')}
            </Body>
          )}

          {status === 'imported' && lastImport && (
            <div className="mb-4">
              {fileName && <Caption className="text-foreground/60 mb-1">{fileName}</Caption>}
              <Caption className="text-foreground/40">
                {t('imported')}: {formatImportTime(lastImport, t, locale)}
              </Caption>
            </div>
          )}

          {status === 'error' && (
            <div className="flex items-start gap-2 mb-4">
              <AlertCircle className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
              <Body size="sm" className="text-secondary">
                {errorMessage || t('errorDefault')}
              </Body>
            </div>
          )}

          <div className="flex items-center gap-3">
            {status === 'none' && (
              <>
                <Button variant="primary" size="sm" className="gap-2" onClick={onUpload}>
                  <Upload className="w-4 h-4" />
                  {t('uploadCsv')}
                </Button>
                <Button variant="ghost" size="sm" className="gap-2" onClick={onDownloadTemplate}>
                  <Download className="w-4 h-4" />
                  {t('template')}
                </Button>
              </>
            )}

            {status === 'imported' && (
              <>
                <Button variant="secondary" size="sm" className="gap-2" onClick={onUpload}>
                  <RefreshCw className="w-4 h-4" />
                  {t('newFile')}
                </Button>
                {onClearImport && (
                  <Button variant="ghost" size="sm" onClick={onClearImport}>
                    {t('clear')}
                  </Button>
                )}
              </>
            )}

            {status === 'error' && (
              <>
                <Button variant="primary" size="sm" className="gap-2" onClick={onUpload}>
                  <RefreshCw className="w-4 h-4" />
                  {t('retry')}
                </Button>
                <Button variant="ghost" size="sm" className="gap-2" onClick={onDownloadTemplate}>
                  <Download className="w-4 h-4" />
                  {t('template')}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </GlassCard>
  )
}
