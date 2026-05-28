'use client'

/**
 * CSV Upload Card Component
 *
 * Polished file dropzone for Yuki/accounting software CSV exports.
 * Includes template download and parsing preview.
 */

import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  Check,
  ChevronRight,
  Download,
  File,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'
import { Badge } from '@/design-system/components/Badge'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { GlassCard } from '@/design-system/components/GlassCard'
import { Body, Caption, Heading, Mono } from '@/design-system/components/Typography'
import { cn } from '@/design-system/utils'
import { getHistoricalYearRange } from '@/utils/yearlyFinancials'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface ParsedCSVData {
  headers: string[]
  rows: string[][]
  totalRows: number
  detectedType:
    | 'yuki'
    | 'exact'
    | 'odoo'
    | 'octopus'
    | 'silverfin'
    | 'accountable'
    | 'generic'
  fiscalYears: string[]
}

export interface CSVUploadCardProps {
  onFileSelected: (file: File, parsedData: ParsedCSVData) => void
  onSkip?: () => void
  className?: string
}

// ─────────────────────────────────────────
// TEMPLATE DATA
// ─────────────────────────────────────────

const buildCsvTemplate = (): string => {
  const years = [...getHistoricalYearRange()].reverse()
  const templateRows = [
    ['8000', 'Omzet verkopen', 'Opbrengsten', ['450000', '520000', '580000']],
    ['8100', 'Omzet diensten', 'Opbrengsten', ['125000', '140000', '165000']],
    ['6000', 'Loonkosten', 'Kosten', ['180000', '195000', '210000']],
    ['6100', 'Sociale lasten', 'Kosten', ['45000', '48000', '52000']],
    ['6200', 'Pensioenlasten', 'Kosten', ['18000', '19000', '21000']],
    ['6300', 'Huur bedrijfspand', 'Kosten', ['36000', '36000', '38000']],
    ['6400', 'Afschrijvingen', 'Kosten', ['25000', '28000', '30000']],
    ['6500', 'Autokosten', 'Kosten', ['18000', '19000', '20000']],
    ['6600', 'Kantoorkosten', 'Kosten', ['8000', '8500', '9000']],
    ['6700', 'Accountantskosten', 'Kosten', ['12000', '13000', '14000']],
    ['6800', 'Overige bedrijfskosten', 'Kosten', ['24000', '26000', '28000']],
  ] as const

  return [
    ['Rekening', 'Omschrijving', 'Type', ...years].join(';'),
    ...templateRows.map(([account, description, type, values]) =>
      [account, description, type, ...values].join(';')
    ),
  ].join('\n')
}

const downloadTemplate = () => {
  const blob = new Blob([buildCsvTemplate()], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'upswitch-grootboek-template.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ─────────────────────────────────────────
// CSV PARSER
// ─────────────────────────────────────────

const parseCSV = (content: string): ParsedCSVData => {
  const lines = content.trim().split('\n')
  const delimiter = content.includes(';') ? ';' : ','

  const headers = lines[0].split(delimiter).map((h) => h.trim())
  const rows = lines.slice(1).map((line) => line.split(delimiter).map((cell) => cell.trim()))

  // Detect source based on headers
  let detectedType: ParsedCSVData['detectedType'] = 'generic'
  const headerStr = headers.join(' ').toLowerCase()

  if (headerStr.includes('yuki') || headerStr.includes('grootboek')) {
    detectedType = 'yuki'
  } else if (headerStr.includes('exact')) {
    detectedType = 'exact'
  } else if (headerStr.includes('silverfin')) {
    detectedType = 'silverfin'
  } else if (headerStr.includes('octopus')) {
    detectedType = 'octopus'
  } else if (headerStr.includes('accountable')) {
    detectedType = 'accountable'
  } else if (headerStr.includes('odoo')) {
    detectedType = 'odoo'
  }

  // Extract fiscal years from headers (numeric columns)
  const fiscalYears = headers.filter((h) => /^20\d{2}$/.test(h))

  return {
    headers,
    rows,
    totalRows: rows.length,
    detectedType,
    fiscalYears,
  }
}

// ─────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────

export function CSVUploadCard({ onFileSelected, onSkip, className }: CSVUploadCardProps) {
  const t = useTranslations('csvUpload')
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedCSVData | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const processFile = useCallback(
    async (selectedFile: File) => {
      setIsProcessing(true)
      setError(null)

      try {
        const content = await selectedFile.text()
        const data = parseCSV(content)

        if (data.rows.length === 0) {
          throw new Error(t('errorNoData'))
        }

        setFile(selectedFile)
        setParsedData(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errorProcessFailed'))
      } finally {
        setIsProcessing(false)
      }
    },
    [t]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile && (droppedFile.type === 'text/csv' || droppedFile.name.endsWith('.csv'))) {
        processFile(droppedFile)
      } else {
        setError(t('errorCsvOnly'))
      }
    },
    [processFile, t]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0]
      if (selectedFile) {
        processFile(selectedFile)
      }
    },
    [processFile]
  )

  const handleContinue = () => {
    if (file && parsedData) {
      onFileSelected(file, parsedData)
    }
  }

  const handleRemoveFile = () => {
    setFile(null)
    setParsedData(null)
    setError(null)
  }

  return (
    <GlassCard className={cn('p-6', className)}>
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Heading level={3} className="text-lg">
              {t('title')}
            </Heading>
            <Badge variant="primary" size="sm">
              CSV
            </Badge>
          </div>
          <Caption className="text-foreground/50">{t('subtitle')}</Caption>
        </div>
      </div>

      {/* Drop Zone or File Preview */}
      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Template Download */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-foreground/[0.02] border border-dashed border-foreground/[0.08] mb-4">
              <div className="flex items-center gap-3">
                <Download className="w-4 h-4 text-foreground/40" />
                <Caption className="text-foreground/60">{t('useTemplate')}</Caption>
              </div>
              <Button variant="ghost" size="sm" className="gap-2" onClick={downloadTemplate}>
                <Download className="w-3.5 h-3.5" />
                {t('downloadTemplate')}
              </Button>
            </div>

            {/* Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                'relative border-2 border-dashed rounded-xl p-8 text-center transition-all',
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-foreground/[0.10] hover:border-foreground/[0.20]',
                isProcessing && 'pointer-events-none opacity-60'
              )}
            >
              <input
                type="file"
                accept=".csv"
                onChange={handleFileInput}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isProcessing}
              />

              {isProcessing ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <Body size="sm" className="text-foreground/60">
                    {t('processing')}
                  </Body>
                </div>
              ) : (
                <>
                  <div
                    className={cn(
                      'w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors',
                      isDragging ? 'bg-primary/20' : 'bg-foreground/[0.06]'
                    )}
                  >
                    <Upload
                      className={cn(
                        'w-7 h-7 transition-colors',
                        isDragging ? 'text-primary' : 'text-foreground/40'
                      )}
                    />
                  </div>
                  <Body size="sm" className="font-medium mb-1">
                    {isDragging ? t('dropActive') : t('dropHere')}
                  </Body>
                  <Caption className="text-foreground/40">{t('orClick')}</Caption>
                </>
              )}
            </div>

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 mt-4 p-3 rounded-lg bg-secondary/10 border border-secondary/20"
              >
                <AlertCircle className="w-4 h-4 text-secondary shrink-0" />
                <Body size="sm" className="text-secondary">
                  {error}
                </Body>
              </motion.div>
            )}

            {/* Supported formats */}
            <div className="flex items-center justify-center gap-4 mt-6">
              <Caption className="text-foreground/30">{t('supported')}</Caption>
              {[
                t('formats.yuki'),
                t('formats.exact'),
                t('formats.octopus'),
                t('formats.accountable'),
                t('formats.odoo'),
                t('formats.generic'),
              ].map((format) => (
                <Badge key={format} variant="neutral" size="sm">
                  {format}
                </Badge>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            {/* File Card */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <File className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <Body size="sm" className="font-medium truncate">
                  {file.name}
                </Body>
                <Caption className="text-foreground/50">{(file.size / 1024).toFixed(1)} KB</Caption>
              </div>
              <button
                onClick={handleRemoveFile}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-foreground/[0.06] transition-colors"
                aria-label={t('removeFile')}
              >
                <X className="w-4 h-4 text-foreground/40" />
              </button>
            </div>

            {/* Parsed Summary */}
            {parsedData && (
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-foreground/[0.02] border border-foreground/[0.06]">
                  <Caption className="text-foreground/40 mb-1">{t('format')}</Caption>
                  <div className="flex items-center gap-2">
                    <Badge variant="primary" size="sm">
                      {parsedData.detectedType === 'yuki'
                        ? t('formats.yuki')
                        : parsedData.detectedType === 'exact'
                          ? t('formats.exact')
                          : parsedData.detectedType === 'octopus'
                            ? t('formats.octopus')
                            : parsedData.detectedType === 'accountable'
                              ? t('formats.accountable')
                              : parsedData.detectedType === 'odoo'
                                ? t('formats.odoo')
                                : t('formats.generic')}
                    </Badge>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-foreground/[0.02] border border-foreground/[0.06]">
                  <Caption className="text-foreground/40 mb-1">{t('accounts')}</Caption>
                  <Mono className="text-lg font-semibold">{parsedData.totalRows}</Mono>
                </div>
                <div className="p-3 rounded-lg bg-foreground/[0.02] border border-foreground/[0.06]">
                  <Caption className="text-foreground/40 mb-1">{t('fiscalYears')}</Caption>
                  <Mono className="text-lg font-semibold">
                    {parsedData.fiscalYears.length > 0 ? parsedData.fiscalYears.join(', ') : '–'}
                  </Mono>
                </div>
              </div>
            )}

            {/* Data Preview */}
            {parsedData && parsedData.rows.length > 0 && (
              <div className="rounded-xl border border-foreground/[0.06] overflow-hidden">
                <div className="px-4 py-3 bg-foreground/[0.02] border-b border-foreground/[0.06]">
                  <Caption className="text-foreground/50">
                    {t('previewRows', { count: Math.min(3, parsedData.rows.length) })}
                  </Caption>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-foreground/[0.06]">
                        {parsedData.headers.slice(0, 5).map((header, i) => (
                          <th
                            key={i}
                            className="px-4 py-2 text-left text-xs font-medium text-foreground/40 uppercase"
                          >
                            {header}
                          </th>
                        ))}
                        {parsedData.headers.length > 5 && (
                          <th className="px-4 py-2 text-left text-xs font-medium text-foreground/40">
                            +{parsedData.headers.length - 5}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-foreground/[0.04]">
                      {parsedData.rows.slice(0, 3).map((row, i) => (
                        <tr key={i}>
                          {row.slice(0, 5).map((cell, j) => (
                            <td
                              key={j}
                              className="px-4 py-2 text-foreground/70 truncate max-w-[150px]"
                            >
                              {cell}
                            </td>
                          ))}
                          {row.length > 5 && <td className="px-4 py-2 text-foreground/40">...</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={handleRemoveFile}>
                {t('chooseOther')}
              </Button>
              <Button variant="primary" onClick={handleContinue}>
                <Check className="w-4 h-4 mr-2" />
                {t('importAndContinue')}
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip Option */}
      {onSkip && !file && (
        <div className="text-center mt-6 pt-6 border-t border-foreground/[0.06]">
          <button
            onClick={onSkip}
            className="text-sm text-foreground/40 hover:text-foreground/60 transition-colors"
          >
            {t('skipAndManual')}
          </button>
        </div>
      )}
    </GlassCard>
  )
}

export default CSVUploadCard
