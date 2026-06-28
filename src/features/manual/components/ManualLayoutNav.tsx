import {
  CalculatorNav,
  type CalculatorNavProps,
  type DownloadHistoryItem,
} from '../../../components/calculator'
import type { User } from '../../../contexts/AuthContextTypes'
import { getManualUserInitials } from '../utils/manualLayoutAdapters'

export interface ManualLayoutNavProps {
  accountantDisplayName?: string
  activeReportId: string
  assistantOpenTasksCount: number
  canDownloadPdf: boolean
  chatDrawerOpen: boolean
  companyName?: string
  deletingValuationId?: string | null
  downloadHistory?: DownloadHistoryItem[]
  effectiveIsRestoringExistingReport: boolean
  ebitdaNormalizationLocked: boolean
  handleAccountSettings?: () => void
  handleBack?: () => void
  handleContinueToListing?: () => void
  handleDeleteValuation: NonNullable<CalculatorNavProps['onDeleteValuation']>
  handleExport: NonNullable<CalculatorNavProps['onDownload']>
  handleFullscreen: () => void
  handleLogout?: () => void
  handleNewValuation: () => void
  handleOpenAssistant: () => void
  handlePlanLockedMethodAction: () => void
  handlePreSelectMethod: NonNullable<CalculatorNavProps['onPreSelectMethod']>
  handlePreview: () => void
  handleSelectValuation: NonNullable<CalculatorNavProps['onSelectValuation']>
  handleSelectVersion?: NonNullable<CalculatorNavProps['onSelectVersion']>
  handleShowGraph: () => void
  handleShowHistory: () => void
  handleSwitchWorkspace?: () => void
  hasReport: boolean
  isAttesting?: boolean
  onSignAttest?: () => void | Promise<void>
  showSignAttest?: boolean
  isApprovingValuation?: boolean
  onApproveValuation?: () => void | Promise<void>
  showApproveValuation?: boolean
  approveValuationLabel?: string
  signAttestLabel?: string
  isAccountantMode: boolean
  isCalculating: boolean
  isExporting: boolean
  isGenerating: boolean
  isMobile: boolean
  navValuationSummary: CalculatorNavProps['valuationSummary']
  onExitClientView?: () => void
  onNavigateToBilling?: () => void
  onNavigateToDashboard?: () => void
  onNavigateToHelp?: () => void
  onOpenNormalization?: () => void
  onOpenValuationEdit: () => void
  openStarterPaywall: (reason: 'pdf_download' | 'normalization' | 'version_history') => void
  pendingNormalizationCount: number
  planLockedMethodKeys?: ReadonlySet<string>
  preSelectableMethodsForNav: readonly string[]
  preSelectedMethod?: string | null
  preSelectedMethods?: string[]
  recentValuations: NonNullable<CalculatorNavProps['recentValuations']>
  rightPanelView: CalculatorNavProps['rightPanelView']
  selectedVersionId?: string
  showFullAdvisorMethodNav: boolean
  togglePreSelectedMethodWithPlanGate: NonNullable<CalculatorNavProps['onToggleMethod']>
  translate: (key: string) => string
  user: User | null
  versionControlLocked: boolean
  versionHistoryForNav?: CalculatorNavProps['valuationVersions']
}

export function ManualLayoutNav({
  accountantDisplayName,
  activeReportId,
  assistantOpenTasksCount,
  canDownloadPdf,
  chatDrawerOpen,
  companyName,
  deletingValuationId,
  downloadHistory,
  effectiveIsRestoringExistingReport,
  ebitdaNormalizationLocked,
  handleAccountSettings,
  handleBack,
  handleContinueToListing,
  handleDeleteValuation,
  handleExport,
  handleFullscreen,
  handleLogout,
  handleNewValuation,
  handleOpenAssistant,
  handlePlanLockedMethodAction,
  handlePreSelectMethod,
  handlePreview,
  handleSelectValuation,
  handleSelectVersion,
  handleShowGraph,
  handleShowHistory,
  handleSwitchWorkspace,
  hasReport,
  isAttesting,
  onSignAttest,
  showSignAttest,
  isApprovingValuation,
  onApproveValuation,
  showApproveValuation,
  approveValuationLabel,
  signAttestLabel,
  isAccountantMode,
  isCalculating,
  isExporting,
  isGenerating,
  isMobile,
  navValuationSummary,
  onExitClientView,
  onNavigateToBilling,
  onNavigateToDashboard,
  onNavigateToHelp,
  onOpenNormalization,
  onOpenValuationEdit,
  openStarterPaywall,
  pendingNormalizationCount,
  planLockedMethodKeys,
  preSelectableMethodsForNav,
  preSelectedMethod,
  preSelectedMethods,
  recentValuations,
  rightPanelView,
  selectedVersionId,
  showFullAdvisorMethodNav,
  togglePreSelectedMethodWithPlanGate,
  translate,
  user,
  versionControlLocked,
  versionHistoryForNav,
}: ManualLayoutNavProps) {
  return (
    <CalculatorNav
      companyName={companyName}
      onBack={handleBack}
      onDownload={handleExport}
      onPreview={handlePreview}
      onShowGraph={handleShowGraph}
      onFullscreen={handleFullscreen}
      onShowHistory={handleShowHistory}
      hasReport={hasReport}
      rightPanelView={rightPanelView}
      userName={
        isAccountantMode && accountantDisplayName
          ? accountantDisplayName
          : user?.name || user?.email || translate('guest')
      }
      userInitials={getManualUserInitials(
        isAccountantMode && accountantDisplayName ? { name: accountantDisplayName } : user
      )}
      userEmail={user?.email}
      avatarUrl={user?.avatar_url || user?.avatar || user?.profile_picture || user?.picture}
      onOpenAssistant={handleOpenAssistant}
      isAssistantOpen={chatDrawerOpen}
      onOpenNormalization={showFullAdvisorMethodNav ? onOpenNormalization : undefined}
      normalizationCount={pendingNormalizationCount}
      openTasksCount={assistantOpenTasksCount}
      isExporting={isExporting}
      downloadHistory={isMobile ? undefined : downloadHistory}
      onRedownload={
        isMobile
          ? undefined
          : (item: DownloadHistoryItem) => {
              if (!canDownloadPdf) {
                openStarterPaywall('pdf_download')
                return
              }
              if (item.url) {
                window.open(item.url, '_blank')
                return
              }
              void handleExport()
            }
      }
      onSignAttest={onSignAttest}
      isAttesting={isAttesting}
      showSignAttest={showSignAttest}
      onApproveValuation={onApproveValuation}
      isApprovingValuation={isApprovingValuation}
      showApproveValuation={showApproveValuation}
      approveValuationLabel={approveValuationLabel}
      signAttestLabel={signAttestLabel}
      onNavigateToDashboard={onNavigateToDashboard}
      onNavigateToBilling={onNavigateToBilling}
      onNavigateToHelp={onNavigateToHelp}
      valuationSummary={navValuationSummary}
      valuationVersions={isMobile ? undefined : versionHistoryForNav}
      selectedVersionId={isMobile ? undefined : selectedVersionId}
      onSelectVersion={isMobile ? undefined : handleSelectVersion}
      onContinueToListing={handleContinueToListing}
      recentValuations={recentValuations}
      activeReportId={activeReportId}
      onNewValuation={handleNewValuation}
      isCalculating={isGenerating || isCalculating || effectiveIsRestoringExistingReport}
      onSelectValuation={handleSelectValuation}
      onDeleteValuation={handleDeleteValuation}
      deletingValuationId={isMobile ? deletingValuationId : undefined}
      onLogout={handleLogout}
      onAccountSettings={handleAccountSettings}
      onSwitchWorkspace={handleSwitchWorkspace}
      isAccountantMode={isAccountantMode}
      onExitClientView={onExitClientView}
      showSourceDataToggle={false}
      onOpenValuationEdit={onOpenValuationEdit}
      preSelectedMethod={preSelectedMethod ?? undefined}
      preSelectedMethods={preSelectedMethods}
      onPreSelectMethod={handlePreSelectMethod}
      onToggleMethod={togglePreSelectedMethodWithPlanGate}
      firmCountryCode={user?.firm_country_code}
      preSelectableMethodsForNav={preSelectableMethodsForNav}
      planLockedMethodKeys={planLockedMethodKeys}
      onPlanLockedMethodAction={handlePlanLockedMethodAction}
      normalizationFeatureLocked={showFullAdvisorMethodNav ? ebitdaNormalizationLocked : false}
      onNormalizationFeatureLocked={
        showFullAdvisorMethodNav ? () => openStarterPaywall('normalization') : undefined
      }
      versionControlFeatureLocked={showFullAdvisorMethodNav ? versionControlLocked : false}
      onVersionControlFeatureLocked={
        showFullAdvisorMethodNav ? () => openStarterPaywall('version_history') : undefined
      }
      canDownloadPdf={canDownloadPdf}
    />
  )
}
