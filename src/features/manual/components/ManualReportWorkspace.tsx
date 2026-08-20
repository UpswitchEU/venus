import { AnimatePresence, motion } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { lazy, Suspense, useRef } from 'react'
import {
  HistoryPanel,
  type HistoryPanelProps,
  type RightPanelView,
  type ValuationReportData,
} from '../../../components/calculator'
import { AcademicValidationNotice } from '../../../components/calculator/sections/AcademicValidationNotice'
import { ErrorState } from '../../../components/ErrorState'
import { ReportPlaceholder } from '../../../components/skeletons/ReportPlaceholder'
import { SafeReportHtml } from '../../../components/valuation/report/SafeReportHtml'
import { springDefault } from '../../../design-system/components/motion'
import { useSessionStore } from '../../../store/useSessionStore'
import { useManualResultsStore } from '../../../store/manual/useManualResultsStore'
import type { ManualLiveMultiplePreview } from '../utils/manualLiveMultiplePreview'
import { PanelSkeleton } from './manualLayoutShell'

// Lazy so the visx valuation-curve bundle only loads when the user opens the
// graph view — they get the panel skeleton (Suspense fallback) on first open,
// then the rendered curve.
const ManualValuationCurvePanel = lazy(() =>
  import('./ManualValuationCurvePanel').then((module) => ({
    default: module.ManualValuationCurvePanel,
  }))
)

type ManualReportWorkspaceTranslator = (key: string) => string

export interface ManualReportWorkspaceProps {
  isCalculating: boolean
  isGenerating: boolean
  isRecoveringReportHtml?: boolean
  isDeletingCurrentReport?: boolean
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
      <div className="sticky top-0 z-[5] mx-4 mt-3 space-y-2 bg-background/95 backdrop-blur-sm">
        <AcademicValidationNotice className="border-b-0" />
      </div>
      <SafeReportHtml html={report.htmlReport ?? ''} />
    </div>
  )
}

function ReportRenderErrorPanel({
  variant,
}: {
  variant: 'payload_too_large' | 'html_recovery_failed'
}) {
  const t = useTranslations('reportPreview')
  if (variant === 'html_recovery_failed') {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px] p-4">
        <ErrorState
          title={t('reportHtmlRecoveryFailed')}
          message={t('reportHtmlRecoveryFailedDesc')}
        />
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center h-full min-h-[400px] p-4">
      <ErrorState title={t('renderPayloadTooLarge')} message={t('renderPayloadTooLargeDesc')} />
    </div>
  )
}

function GeneratingLoader({
  translateReport,
}: {
  translateReport: ManualReportWorkspaceTranslator
}) {
  return (
    <motion.div
      className="h-full flex flex-col items-center justify-center gap-5 bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="relative w-14 h-14">
        <div className="absolute inset-0 rounded-full border-[3px] border-foreground/8" />
        <div className="absolute inset-0 rounded-full border-[3px] border-primary border-t-transparent animate-spin" />
      </div>
      <div className="text-center space-y-1.5">
        <p className="text-sm font-medium text-foreground/70">
          {translateReport('generating.title')}
        </p>
        <p className="text-xs text-foreground/35 max-w-[220px] leading-relaxed">
          {translateReport('generating.description')}
        </p>
      </div>
    </motion.div>
  )
}

function ClearingLoader({ translate }: { translate: ManualReportWorkspaceTranslator }) {
  return (
    <motion.div
      className="h-full flex flex-col items-center justify-center gap-4 bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-foreground/8" />
        <div className="absolute inset-0 rounded-full border-2 border-foreground/30 border-t-transparent animate-spin" />
      </div>
      <p className="text-sm text-foreground/40">{translate('updatingReport')}</p>
    </motion.div>
  )
}

export function ManualReportWorkspace({
  isCalculating,
  isGenerating,
  isRecoveringReportHtml = false,
  isDeletingCurrentReport = false,
  isMethodSwitchRendering,
  liveMultipleReportPreview,
  onVersionRestore,
  report,
  reportId,
  rightPanelView,
  translate,
  translateReport,
}: ManualReportWorkspaceProps) {
  const locale = useLocale()
  const reportPanelRef = useRef<HTMLDivElement>(null)
  const renderError = useSessionStore((state) => state.renderError)
  const recoveryResolution = useManualResultsStore(
    (state) => state.result?.negativeEbitdaResolution
  )
  const recoveryRangeWithheld =
    recoveryResolution?.status === 'no_going_concern_range' &&
    recoveryResolution.primaryMethod === null
  const isClearing = isDeletingCurrentReport
  const isBusy = isGenerating || isCalculating || isRecoveringReportHtml || isDeletingCurrentReport
  const showPayloadTooLarge = renderError === 'payload_too_large' && !report?.htmlReport && !isBusy
  const showHtmlRecoveryFailed =
    renderError === 'html_recovery_failed' && !report?.htmlReport && !isBusy

  return (
    <div ref={reportPanelRef} className="h-full bg-background flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {rightPanelView === 'graph' && recoveryRangeWithheld ? (
            <motion.div
              key="recovery-no-chart"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={springDefault}
              className="flex h-full items-center justify-center bg-background p-8"
            >
              <div className="max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                  {locale === 'fr'
                    ? 'Évaluation du redressement'
                    : locale === 'en'
                      ? 'Recovery assessment'
                      : 'Herstelbeoordeling'}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-neutral-950">
                  {locale === 'fr'
                    ? 'Aucune fourchette défendable établie à ce stade'
                    : locale === 'en'
                      ? 'No defensible range established yet'
                      : 'Nog geen verdedigbare waarderingsrange vastgesteld'}
                </h2>
                <p className="mt-3 text-sm leading-6 text-neutral-600">
                  {locale === 'fr'
                    ? 'Aucun graphique ni montant nul ne sera affiché. Consultez le rapport pour les éléments bloquants, les preuves requises et les actions recommandées.'
                    : locale === 'en'
                      ? 'No chart or zero value is shown. Use the report for blockers, required evidence and the recommended recovery actions.'
                      : 'Er wordt geen grafiek of nulwaarde getoond. Bekijk het rapport voor blokkades, vereist bewijs en aanbevolen herstelacties.'}
                </p>
              </div>
            </motion.div>
          ) : rightPanelView === 'graph' ? (
            <motion.div
              key="graph"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={springDefault}
              className="h-full bg-background"
            >
              <Suspense fallback={<PanelSkeleton />}>
                <ManualValuationCurvePanel loading={isBusy} />
              </Suspense>
            </motion.div>
          ) : rightPanelView === 'preview' ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={springDefault}
              className="valuation-report-container h-full overflow-y-auto bg-background"
            >
              <AnimatePresence mode="wait">
                {report?.htmlReport ? (
                  <motion.div
                    key="html"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={springDefault}
                  >
                    <HtmlReportSurface
                      isMethodSwitchRendering={isMethodSwitchRendering}
                      liveMultipleReportPreview={liveMultipleReportPreview}
                      report={report}
                      translate={translate}
                    />
                  </motion.div>
                ) : isClearing ? (
                  <ClearingLoader key="clearing" translate={translate} />
                ) : isBusy ? (
                  <GeneratingLoader key="generating" translateReport={translateReport} />
                ) : showPayloadTooLarge ? (
                  <motion.div
                    key="error-large"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={springDefault}
                  >
                    <ReportRenderErrorPanel variant="payload_too_large" />
                  </motion.div>
                ) : showHtmlRecoveryFailed ? (
                  <motion.div
                    key="error-recovery"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={springDefault}
                  >
                    <ReportRenderErrorPanel variant="html_recovery_failed" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={springDefault}
                    className="h-full"
                  >
                    <ReportPlaceholder />
                  </motion.div>
                )}
              </AnimatePresence>
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
          ) : isClearing ? (
            <motion.div
              key="clearing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={springDefault}
              className="h-full bg-background"
            >
              <ClearingLoader translate={translate} />
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
              <GeneratingLoader translateReport={translateReport} />
            </motion.div>
          ) : showPayloadTooLarge ? (
            <motion.div
              key="render-error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={springDefault}
              className="h-full bg-background"
            >
              <ReportRenderErrorPanel variant="payload_too_large" />
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
