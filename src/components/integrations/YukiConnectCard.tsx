'use client'

import { CSVImportCard } from './CSVImportCard'
import type { ImportStatus, YukiConnectCardProps } from './yukiIntegrationTypes'

export function YukiConnectCard({
  connectionStatus,
  onConnect,
  onDisconnect,
  className,
}: YukiConnectCardProps) {
  const importStatus: ImportStatus = {
    status:
      connectionStatus.status === 'connected'
        ? 'imported'
        : connectionStatus.status === 'connecting'
          ? 'processing'
          : connectionStatus.status === 'error'
            ? 'error'
            : 'none',
    lastImport: connectionStatus.lastSync,
    errorMessage: connectionStatus.errorMessage,
  }

  return (
    <CSVImportCard
      importStatus={importStatus}
      onUpload={onConnect}
      onDownloadTemplate={() => undefined}
      onClearImport={onDisconnect}
      className={className}
      softwareName="Yuki"
    />
  )
}
