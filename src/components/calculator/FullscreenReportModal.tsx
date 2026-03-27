'use client'

/**
 * Report Modal — Centered Modal Pattern (Aurora design)
 *
 * Displays the valuation report in a centered modal (max-w-[90vw] max-h-[90vh])
 * using design-system Modal. Matches Mercury report template pattern.
 *
 * - Floating top-right toolbar: Zoom, Print, Share, Download, Close
 * - Radix Dialog animations (fade + zoom)
 * - ESC key to close
 * - Print-friendly CSS (hides toolbar on print)
 */

import { Download, Loader2, Printer, Share2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { AuroraButton } from '@/design-system'
import { Modal, ModalContent } from '@/design-system/components/Modal'
import { ReportSkeleton } from '@/components/skeletons/ReportSkeleton'
import { HTMLProcessor } from '@/utils/htmlProcessor'
import type { ValuationReportData } from './types'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface FullscreenReportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  report?: ValuationReportData | null
  onExport?: () => void
  onDownload?: () => void
  onShare?: () => void
  onPrint?: () => void
  isExporting?: boolean
}

// ─────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────

export function FullscreenReportModal({
  open,
  onOpenChange,
  report,
  onExport,
  onDownload,
  onShare,
  onPrint,
  isExporting = false,
}: FullscreenReportModalProps) {
  const t = useTranslations()
  const [zoom, setZoom] = useState(100)

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 25, 200))
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 25, 50))
  const handlePrint = onPrint ?? (() => window.print())

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        size="full"
        variant="default"
        showClose={false}
        className="report-modal fixed inset-0 w-screen h-screen max-w-none max-h-none translate-x-0 translate-y-0 rounded-none p-0 flex flex-col overflow-hidden bg-background"
      >
        {/* Print Styles */}
        <style>{`
          @media print {
            @page {
              size: A4;
              margin: 0;
            }
            body * {
              visibility: hidden;
            }
            .report-modal,
            .report-modal * {
              visibility: visible;
            }
            .report-modal {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              background: white !important;
            }
            .report-modal .no-print {
              display: none !important;
            }
          }
        `}</style>

        {/* Floating Header — Hidden on Print (Clarity design) */}
        <header className="no-print absolute top-4 right-4 z-10 flex items-center gap-1 p-1.5 rounded-xl bg-background/80 backdrop-blur-md border border-foreground/10 shadow-lg">
          {/* Zoom controls */}
          <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-foreground/[0.04] border border-foreground/10">
            <button
              onClick={handleZoomOut}
              disabled={zoom <= 50}
              className="p-1.5 rounded text-foreground/50 hover:text-foreground disabled:opacity-30 transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono text-foreground/60 min-w-[3rem] text-center">
              {zoom}%
            </span>
            <button
              onClick={handleZoomIn}
              disabled={zoom >= 200}
              className="p-1.5 rounded text-foreground/50 hover:text-foreground disabled:opacity-30 transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <div className="hidden sm:block h-5 w-px bg-foreground/10 mx-1" aria-hidden />

          <button
            type="button"
            onClick={handlePrint}
            className="hidden sm:block p-2 rounded-lg text-foreground/50 hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
          >
            <Printer className="w-4 h-4" aria-hidden />
          </button>

          {onShare && (
            <AuroraButton variant="ghost" size="sm" onClick={onShare}>
              <Share2 className="w-4 h-4" />
            </AuroraButton>
          )}

          {(onExport || onDownload) && (
            <AuroraButton
              variant="secondary"
              size="sm"
              onClick={onDownload || onExport}
              disabled={isExporting}
              className="gap-1.5"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">
                {isExporting
                  ? t('common.exporting') || 'Exporteren...'
                  : t('report.exportPDF') || 'PDF'}
              </span>
            </AuroraButton>
          )}

          <div className="h-5 w-px bg-foreground/10 mx-1" aria-hidden />

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-lg text-foreground/50 hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </header>

        {/* Report Content — Aurora canvas (matches main panel, no white flash) */}
        <div
          className="valuation-report-container flex-1 min-h-0 overflow-y-auto pt-2 bg-background"
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
          }}
        >
          {report?.dcfHistoricalFcfReadiness && (
            <div className="mx-auto mb-3 max-w-5xl rounded-xl border border-primary/15 bg-primary/[0.04] px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
                {t('methodBreakdown.historicalFcfReadiness') || 'Historical FCF readiness'}
              </div>
              <p className="mt-1 text-sm text-foreground/80">
                {t(
                  `calculator.fcfReadiness.${report.dcfHistoricalFcfReadiness.status}.title`
                )}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-foreground/55">
                {t(
                  `calculator.fcfReadiness.${report.dcfHistoricalFcfReadiness.status}.description`,
                  {
                    years: report.dcfHistoricalFcfReadiness.historical_years_count,
                    capex: report.dcfHistoricalFcfReadiness.actual_capex_years,
                    taxes: report.dcfHistoricalFcfReadiness.actual_tax_years,
                    workingCapital: report.dcfHistoricalFcfReadiness.actual_nwc_years,
                  }
                )}
              </p>
            </div>
          )}
          {report?.htmlReport ? (
            <div className="valuation-report">
              <div
                dangerouslySetInnerHTML={{
                  __html: HTMLProcessor.sanitize(report.htmlReport),
                }}
              />
            </div>
          ) : (
            <ReportSkeleton />
          )}
        </div>
      </ModalContent>
    </Modal>
  )
}

export default FullscreenReportModal
