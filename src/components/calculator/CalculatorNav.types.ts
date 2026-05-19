export type RightPanelView = 'report' | 'preview' | 'history'

export interface RecentValuation {
  id: string
  companyName: string
  updatedAt: Date
  isDraft?: boolean
  deleteMode?: 'session' | 'report'
}

export interface ValuationVersion {
  id: string
  label: string
  priceRange: { min: number; max: number }
  askPrice: number
  timestamp: Date
  isActive?: boolean
}

export interface DownloadHistoryItem {
  id: string
  fileName: string
  timestamp: Date
  size?: string
  url?: string
}

export interface CalculatorNavProps {
  companyName?: string
  onBack?: () => void
  onDownload?: () => void | Promise<void>
  onFullscreen?: () => void
  onPreview?: () => void
  onShowHistory?: () => void
  hasReport?: boolean
  rightPanelView?: RightPanelView
  userName?: string
  userInitials?: string
  userEmail?: string
  avatarUrl?: string | null
  onAccountSettings?: () => void
  onSwitchWorkspace?: () => void
  onLogout?: () => void
  onNavigateToDashboard?: () => void
  onNavigateToBilling?: () => void
  onNavigateToHelp?: () => void
  recentValuations?: RecentValuation[]
  activeReportId?: string
  onSelectValuation?: (id: string) => void
  onDeleteValuation?: (valuation: RecentValuation) => void
  deletingValuationId?: string | null
  onNewValuation?: () => void
  isCalculating?: boolean
  onOpenAssistant?: () => void
  isAssistantOpen?: boolean
  onOpenNormalization?: () => void
  normalizationCount?: number
  openTasksCount?: number
  valuationSummary?: {
    priceRange: { min: number; max: number }
    askPrice: number
    confidence: 'high' | 'medium' | 'low'
  }
  valuationVersions?: ValuationVersion[]
  selectedVersionId?: string
  onSelectVersion?: (id: string) => void
  onContinueToListing?: () => void
  isExporting?: boolean
  downloadHistory?: DownloadHistoryItem[]
  onRedownload?: (item: DownloadHistoryItem) => void
  canDownloadPdf?: boolean
  isAccountantMode?: boolean
  onExitClientView?: () => void
  showSourceDataToggle?: boolean
  sourceDataOpen?: boolean
  onToggleSourceData?: () => void
  onOpenValuationEdit?: () => void
  preSelectedMethod?: string
  onPreSelectMethod?: (method: string) => void
  preSelectedMethods?: string[]
  onToggleMethod?: (method: string) => void
  firmCountryCode?: string
  preSelectableMethodsForNav?: readonly string[]
  planLockedMethodKeys?: ReadonlySet<string>
  onPlanLockedMethodAction?: () => void
  normalizationFeatureLocked?: boolean
  onNormalizationFeatureLocked?: () => void
  versionControlFeatureLocked?: boolean
  onVersionControlFeatureLocked?: () => void
}
