export interface ImportStatus {
  status: 'none' | 'processing' | 'imported' | 'error'
  lastImport?: Date
  fileName?: string
  errorMessage?: string
}

export interface SuggestedNormalisation {
  id: string
  category: string
  description: string
  amount: number
  reason: string
  status: 'pending' | 'accepted' | 'rejected'
}

export interface CSVImportCardProps {
  importStatus: ImportStatus
  onUpload: () => void
  onDownloadTemplate: () => void
  onClearImport?: () => void
  className?: string
  softwareName?: 'Yuki' | 'Exact' | 'Odoo' | 'Octopus' | 'Accountable' | 'Generiek'
}

export interface NormalisationReviewProps {
  suggestions: SuggestedNormalisation[]
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onAcceptAll: () => void
  className?: string
}

export interface YukiConnectionStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  lastSync?: Date
  errorMessage?: string
}

export interface YukiConnectCardProps {
  connectionStatus: YukiConnectionStatus
  onConnect: () => void
  onResync?: () => void
  onDisconnect?: () => void
  className?: string
}

export interface MappingRow {
  yukiCode: string
  yukiDescription: string
  mappedTo: string
  category: 'revenue' | 'expense' | 'asset' | 'liability'
}
