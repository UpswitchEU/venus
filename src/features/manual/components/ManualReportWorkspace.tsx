import { AnimatePresence, motion } from 'framer-motion'
import { Suspense, useRef } from 'react'
import {
  HistoryPanel,
  type HistoryPanelProps,
  type RightPanelView,
  type ValuationReportData,
} from '../../../components/calculator'
import { ReportPlaceholder } from '../../../components/skeletons/ReportPlaceholder'
import { ReportSkeleton } from '../../../components/skeletons/ReportSkeleton'
import { springDefault } from '../../../design-system/components/motion'
import { HTMLProcessor } from '../../../utils/htmlProcessor'
import type { ManualLiveMultiplePreview } from '../utils/manualLiveMultiplePreview'
import { PanelSkeleton } from './manualLayoutShell'

type ManualReportWorkspaceTranslator = (key: string) => string

export interface ManualReportWorkspaceProps {
  isCalculating: boolean
  isGenerating: boolean
  isMethodSwitchRendering: boolean
  liveMultipleReportPreview: ManualLiveMultiplePreview | null
  onVersionRestore: HistoryPanelProps['onVersionRestore']
  report: ValuationReportData | null
  reportId: string
  rightPanelView: RightPanelView
  translate: ManualReportWorkspaceTranslator
  translateReport: ManualReportWorkspaceTranslator
}

function MethodSwitchOverlay({ translate }: { translate: ManualReportWorkspaceTranslator }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
      <div className="flex items-center gap-2 rounded-lg bg-background/90 px-4 py-2 shadow-sm">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-foreground/70">{translate('updatingReport')}</span>
      </div>
    </div>
  )
}

function LiveMultiplePreviewBanner({
  preview,
  translate,
}: {
  preview: ManualLiveMultiplePreview
  translate: ManualReportWorkspaceTranslator
}) {
  return (
    <div className="sticky top-0 z-[5] border-b border-primary/15 bg-primary/[0.06] px-4 py-3 backdrop-blur-sm">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/75">
            {translate('previewEquityValue')}
          </p>
          <p className="text-sm text-foreground/70">{translate('previewEquityBlurb')}</p>
        </div>
        <div className="text-left md:text-right">
          <p className="text-lg font-mono font-semibold tabular-nums text-primary">
            €{(preview.previewEquity / 1_000_000).toFixed(2)}M
          </p>
          <p className="text-[11px] font-mono tabular-nums text-foreground/55">
            {preview.delta >= 0 ? '+' : '-'}€{(Math.abs(preview.delta) / 1_000).toFixed(0)}K ·{' '}
            {preview.appliedMultiple.toFixed(2)}×
          </p>
        </div>
      </div>
    </div>
  )
}

function HtmlReportSurface({
  isMethodSwitchRendering,
  liveMultipleReportPreview,
  report,
  translate,
}: {
  isMethodSwitchRendering: boolean
  liveMultipleReportPreview: ManualLiveMultiplePreview | null
  report: ValuationReportData
  translate: ManualReportWorkspaceTranslator
}) {
  return (
    <div className="relative">
      {isMethodSwitchRendering && <MethodSwitchOverlay translate={translate} />}
      {liveMultipleReportPreview && (
        <LiveMultiplePreviewBanner preview={liveMultipleReportPreview} translate={translate} />
      )}
      <div className="valuation-report">
        <div
          dangerouslySetInnerHTML={{
            __html: HTMLProcessor.sanitize(report.htmlReport ?? ''),
          }}
        />
      </div>
    </div>
  )
}

function GeneratingPreview({
  translateReport,
}: {
  translateReport: ManualReportWorkspaceTranslator
}) {
  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center justify-center gap-2 py-4">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-foreground/70">{translateReport('generating.title')}</span>
      </div>
      <ReportSkeleton />
    </div>
  )
}

export function ManualReportWorkspace({
  isCalculating,
  isGenerating,
  isMethodSwitchRendering,
  liveMultipleReportPreview,
  onVersionRestore,
  report,
  reportId,
  rightPanelView,
  translate,
  translateReport,
}: ManualReportWorkspaceProps) {
  const reportPanelRef = useRef<HTMLDivElement>(null)
  const isBusy = isGenerating || isCalculating

  return (
    <div ref={reportPanelRef} className="h-full bg-background flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {rightPanelView === 'preview' ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={springDefault}
              className="valuation-report-container h-full overflow-y-auto bg-background"
            >
              {report?.htmlReport ? (
                <HtmlReportSurface
                  isMethodSwitchRendering={isMethodSwitchRendering}
                  liveMultipleReportPreview={liveMultipleReportPreview}
                  report={report}
                  translate={translate}
                />
              ) : isBusy ? (
                <GeneratingPreview translateReport={translateReport} />
              ) : (
                <ReportPlaceholder />
              )}
            </motion.div>
          ) : rightPanelView === 'history' ? (
            <motion.div
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={springDefault}
              className="h-full bg-background"
            >
              <Suspense fallback={<PanelSkeleton />}>
                <HistoryPanel
                  report={report}
                  reportId={reportId}
                  onVersionRestore={onVersionRestore}
                />
              </Suspense>
            </motion.div>
          ) : report?.htmlReport ? (
            <motion.div
              key="html-report"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={springDefault}
              className="valuation-report-container h-full overflow-y-auto bg-background relative"
            >
              <HtmlReportSurface
                isMethodSwitchRendering={isMethodSwitchRendering}
                liveMultipleReportPreview={liveMultipleReportPreview}
                report={report}
                translate={translate}
              />
            </motion.div>
          ) : isBusy ? (
            <motion.div
              key="report"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={springDefault}
              className="h-full bg-background"
            >
              <ReportSkeleton />
            </motion.div>
          ) : (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={springDefault}
              className="h-full bg-background"
            >
              <ReportPlaceholder />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
