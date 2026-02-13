'use client';

/**
 * Fullscreen Report Modal
 * 
 * Displays the valuation report in full-screen mode for presentation.
 * Aurora design system compliant.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Download, 
  Share2, 
  Printer,
  ZoomIn,
  ZoomOut,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/design-system/utils';
import { HTMLProcessor } from '@/utils/htmlProcessor';
import { 
  AuroraButton,
  springSnappy,
} from '@/design-system';
import { ValuationReportPanel, type ValuationReportData } from './ValuationReportPanel';

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface FullscreenReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report?: ValuationReportData | null;
  onExport?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  onPrint?: () => void;
  isExporting?: boolean;
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
  const t = useTranslations();
  const [zoom, setZoom] = useState(100);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-background"
        >
          {/* Toolbar */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-background/80 backdrop-blur-lg border-b border-foreground/[0.06]">
            {/* Left: Close */}
            <button
              onClick={() => onOpenChange(false)}
              className="p-2 rounded-lg text-foreground/50 hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Center: Title */}
            <div className="text-center">
              <h2 className="text-sm font-medium text-foreground">
                {report?.companyName || t('report.title') || 'Bedrijfsschatting'}
              </h2>
              <p className="text-xs text-foreground/50">
                {t('report.fullscreen') || 'Volledig scherm'}
              </p>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              {/* Zoom controls */}
              <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-foreground/[0.04] border border-foreground/[0.08]">
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

              {/* Print */}
              {onPrint && (
                <AuroraButton
                  variant="ghost"
                  size="sm"
                  onClick={onPrint}
                  className="hidden sm:flex"
                >
                  <Printer className="w-4 h-4" />
                </AuroraButton>
              )}

              {/* Share */}
              {onShare && (
                <AuroraButton
                  variant="ghost"
                  size="sm"
                  onClick={onShare}
                >
                  <Share2 className="w-4 h-4" />
                </AuroraButton>
              )}

              {/* Export / Download */}
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
                    {isExporting ? (t('common.exporting') || 'Exporteren...') : (t('report.exportPDF') || 'PDF')}
                  </span>
                </AuroraButton>
              )}
            </div>
          </div>

          {/* Content */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={springSnappy}
            className="h-full pt-16 overflow-auto"
            style={{ 
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
            }}
          >
            <div className="min-h-full">
              {/* If HTML report exists, render it as the primary fullscreen content */}
              {report?.htmlReport ? (
                <div className="max-w-5xl mx-auto p-6 md:p-10">
                  <div
                    className="prose prose-sm md:prose-base max-w-none dark:prose-invert [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted/50"
                    dangerouslySetInnerHTML={{ __html: HTMLProcessor.sanitize(report.htmlReport!) }}
                  />
                </div>
              ) : (
                <ValuationReportPanel
                  report={report ?? null}
                  onExport={onExport}
                  isExporting={isExporting}
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default FullscreenReportModal;
