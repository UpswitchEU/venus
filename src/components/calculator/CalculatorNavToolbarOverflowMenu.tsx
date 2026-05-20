import {
  Check,
  CheckCircle2,
  Database,
  Download,
  History,
  Loader2,
  Lock,
  Maximize2,
  MoreHorizontal,
} from 'lucide-react'
import type { useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import type { DownloadHistoryItem, RightPanelView } from './CalculatorNav.types'
import { formatTimeAgo } from './CalculatorNav.utils'
import { Dropdown } from './CalculatorNavDropdown'

interface ToolbarOverflowMenuProps {
  navLocale: string
  t: ReturnType<typeof useTranslations>
  hasReport: boolean
  rightPanelView: RightPanelView
  showSourceDataToggle: boolean
  sourceDataOpen: boolean
  onToggleSourceData?: () => void
  onShowHistory?: () => void
  onDownload?: () => void | Promise<void>
  onRedownload?: (item: DownloadHistoryItem) => void
  onFullscreen?: () => void
  isExporting: boolean
  pdfPlanLocked: boolean
  pdfDownloadTooltip: string | null
  downloadHistory: DownloadHistoryItem[]
  compactTouchTarget?: boolean
}

export const ToolbarOverflowMenu: React.FC<ToolbarOverflowMenuProps> = ({
  navLocale,
  t,
  hasReport,
  rightPanelView,
  showSourceDataToggle,
  sourceDataOpen,
  onToggleSourceData,
  onShowHistory,
  onDownload,
  onRedownload,
  onFullscreen,
  isExporting,
  pdfPlanLocked,
  pdfDownloadTooltip,
  downloadHistory,
  compactTouchTarget = false,
}) => {
  const hasSourceData = showSourceDataToggle && !!onToggleSourceData
  const hasHistory = !!onShowHistory
  const hasDownload = !!onDownload
  const hasFullscreen = !!onFullscreen
  const hasAnyAction = hasSourceData || hasHistory || hasDownload || hasFullscreen

  if (!hasAnyAction) return null

  const sourceDataLabel = navLocale === 'nl' ? 'Brondata' : 'Source data'
  const moreLabel = navLocale === 'nl' ? 'Meer acties' : 'More actions'
  const upgradeLabel =
    navLocale === 'nl'
      ? 'Upgrade voor PDF-download (Starter)'
      : 'Upgrade for PDF download (Starter)'
  const triggerActive =
    (sourceDataOpen && hasSourceData) || (rightPanelView === 'history' && hasReport)
  const showPanelDivider = (hasSourceData || hasHistory) && (hasDownload || hasFullscreen)

  return (
    <Dropdown
      align="end"
      trigger={
        <button
          type="button"
          aria-label={moreLabel}
          aria-haspopup="menu"
          title={moreLabel}
          className={cn(
            'relative rounded-lg transition-colors flex items-center justify-center',
            compactTouchTarget ? 'p-2 min-h-[44px] min-w-[44px]' : 'p-2',
            triggerActive
              ? 'text-primary bg-primary/15 ring-1 ring-primary/30 shadow-sm'
              : 'text-foreground/50 hover:text-foreground hover:bg-foreground/[0.04]'
          )}
        >
          {isExporting ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" aria-hidden />
          ) : (
            <MoreHorizontal className="w-4 h-4" aria-hidden />
          )}
        </button>
      }
    >
      <div className="p-1.5 w-64" role="menu">
        {hasSourceData && (
          <button
            type="button"
            role="menuitem"
            aria-pressed={sourceDataOpen}
            onClick={onToggleSourceData}
            className={cn(
              'w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors text-left text-sm',
              sourceDataOpen
                ? 'bg-primary/[0.06] text-foreground'
                : 'text-foreground/80 hover:text-foreground hover:bg-foreground/[0.04]'
            )}
          >
            <Database className="w-4 h-4 shrink-0 text-foreground/55" aria-hidden />
            <span className="flex-1">{sourceDataLabel}</span>
            {sourceDataOpen && <Check className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden />}
          </button>
        )}

        {hasHistory && (
          <button
            type="button"
            role="menuitem"
            aria-pressed={rightPanelView === 'history'}
            onClick={onShowHistory}
            disabled={!hasReport}
            className={cn(
              'w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors text-left text-sm',
              !hasReport
                ? 'text-foreground/30 cursor-not-allowed'
                : rightPanelView === 'history'
                  ? 'bg-primary/[0.06] text-foreground'
                  : 'text-foreground/80 hover:text-foreground hover:bg-foreground/[0.04]'
            )}
          >
            <History className="w-4 h-4 shrink-0 text-foreground/55" aria-hidden />
            <span className="flex-1">{t('report.history')}</span>
            {rightPanelView === 'history' && hasReport && (
              <Check className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden />
            )}
          </button>
        )}

        {showPanelDivider && <div className="h-px bg-foreground/[0.06] my-1.5" />}

        {hasDownload && (
          <button
            type="button"
            role="menuitem"
            onClick={onDownload}
            disabled={!hasReport || isExporting}
            title={pdfPlanLocked ? (pdfDownloadTooltip ?? undefined) : undefined}
            className={cn(
              'w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors text-left text-sm',
              !hasReport || isExporting
                ? 'opacity-50 cursor-not-allowed'
                : pdfPlanLocked
                  ? 'text-amber-700 dark:text-amber-300 hover:bg-amber-500/10'
                  : 'text-foreground/80 hover:text-foreground hover:bg-foreground/[0.04]'
            )}
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" aria-hidden />
            ) : pdfPlanLocked ? (
              <Lock
                className="w-4 h-4 shrink-0 text-amber-600/90 dark:text-amber-400/90"
                aria-hidden
              />
            ) : (
              <Download className="w-4 h-4 shrink-0 text-foreground/55" aria-hidden />
            )}
            <span className="flex-1">
              {isExporting
                ? t('report.generatingPDF')
                : pdfPlanLocked
                  ? upgradeLabel
                  : t('report.downloadPDF')}
            </span>
          </button>
        )}

        {hasFullscreen && (
          <button
            type="button"
            role="menuitem"
            onClick={onFullscreen}
            disabled={!hasReport}
            className={cn(
              'w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors text-left text-sm',
              !hasReport
                ? 'text-foreground/30 cursor-not-allowed'
                : 'text-foreground/80 hover:text-foreground hover:bg-foreground/[0.04]'
            )}
          >
            <Maximize2 className="w-4 h-4 shrink-0 text-foreground/55" aria-hidden />
            <span className="flex-1">{t('report.fullscreen')}</span>
          </button>
        )}

        {downloadHistory.length > 0 && (
          <>
            <div className="h-px bg-foreground/[0.06] my-1.5" />
            <div className="text-[10px] text-foreground/40 uppercase tracking-wider font-medium px-2 py-1">
              {t('report.recentDownloads')}
            </div>
            {downloadHistory.slice(0, 5).map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => (pdfPlanLocked ? void onDownload?.() : void onRedownload?.(item))}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-foreground/[0.04] transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{item.fileName}</p>
                  <p className="text-[10px] text-foreground/40">
                    {formatTimeAgo(item.timestamp, t)}
                    {item.size && ` · ${item.size}`}
                  </p>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    </Dropdown>
  )
}
