'use client'

import { ImportStatusBadge } from './ImportStatusBadge'
import type { ImportStatus, YukiConnectionStatus } from './yukiIntegrationTypes'

export function SyncStatusBadge({
  status,
  lastSync,
}: {
  status: YukiConnectionStatus['status']
  lastSync?: Date
}) {
  const mappedStatus: ImportStatus['status'] =
    status === 'connected'
      ? 'imported'
      : status === 'connecting'
        ? 'processing'
        : status === 'error'
          ? 'error'
          : 'none'

  return <ImportStatusBadge status={mappedStatus} lastImport={lastSync} />
}
