/**
 * Valuation Toolbar Download Hook
 *
 * Single Responsibility: Handle PDF download logic for ValuationToolbar
 * SOLID Principles: SRP - Only handles download operations with state management
 *
 * @module hooks/valuationToolbar/useValuationToolbarDownload
 */

import { useCallback, useState } from 'react'
import { trackPDFDownload } from '@/lib/analytics'
import type { ValuationData } from '../../services/downloadService'
import { generalLogger } from '../../utils/logger'

export interface UseValuationToolbarDownloadReturn {
  isDownloading: boolean
  downloadError: Error | null
  handleDownload: (valuationData: ValuationData) => Promise<void>
}

/**
 * Hook for managing PDF download operations in ValuationToolbar
 *
 * Wraps DownloadService with proper error handling and loading states
 *
 * @returns Download state and handler
 */
export const useValuationToolbarDownload = (): UseValuationToolbarDownloadReturn => {
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<Error | null>(null)

  const handleDownload = useCallback(async (valuationData: ValuationData) => {
    setIsDownloading(true)
    setDownloadError(null)

    try {
      // Dynamic import to reduce initial bundle size
      const { DownloadService } = await import('../../services/downloadService')

      // Generate filename if not provided
      const filename = valuationData.companyName
        ? `valuation-${valuationData.companyName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.pdf`
        : `valuation-report-${Date.now()}.pdf`

      await DownloadService.downloadPDF(valuationData, {
        format: 'pdf',
        filename,
      })

      trackPDFDownload()
      generalLogger.info('PDF download completed successfully', {
        companyName: valuationData.companyName,
        filename,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error : new Error('Download failed')
      setDownloadError(errorMessage)
      generalLogger.error('PDF download failed', {
        error: errorMessage,
        companyName: valuationData.companyName,
      })
    } finally {
      setIsDownloading(false)
    }
  }, [])

  return {
    isDownloading,
    downloadError,
    handleDownload,
  }
}
