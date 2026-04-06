/**
 * Manual Toolbar Hook
 *
 * Single Responsibility: Toolbar handlers for manual layout.
 *
 * @module features/manual/hooks/useManualToolbar
 */

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { trackPDFDownload } from '@/lib/analytics'
import { useValuationToolbarRefresh } from '../../../hooks/valuationToolbar'
import { backendAPI } from '../../../services/backendApi'
import { RefreshService } from '../../../services/toolbar/refreshService'
import UrlGeneratorService from '../../../services/urlGenerator'
import { useManualResultsStore } from '../../../store/manual'
import { useSessionStore } from '../../../store/useSessionStore'
import { APIError } from '../../../types/errors'
import type { ValuationResponse } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { generateReportId } from '../../../utils/reportIdGenerator'

/**
 * Manual Toolbar Hook Return Type
 */
export interface UseManualToolbarReturn {
  /** Handle refresh action */
  handleRefresh: () => void
  /** Handle download action */
  handleDownload: () => Promise<void>
  /** Whether download is in progress */
  isDownloading: boolean
}

/**
 * Manual Toolbar Hook Options
 */
interface UseManualToolbarOptions {
  /** Current valuation result */
  result: ValuationResponse | null
}

/**
 * Manual Toolbar Hook
 *
 * Provides toolbar handlers for manual layout.
 */
export const useManualToolbar = ({ result }: UseManualToolbarOptions): UseManualToolbarReturn => {
  const { handleRefresh: handleHookRefresh } = useValuationToolbarRefresh()
  const tToast = useTranslations('toast')
  // Read from unified session store
  const sessionReportId = useSessionStore((state) => state.session?.reportId)
  const [isDownloading, setIsDownloading] = useState(false)

  const handleRefresh = useCallback(() => {
    const newReportId = generateReportId()
    RefreshService.navigateTo(UrlGeneratorService.reportById(newReportId))
    handleHookRefresh()
  }, [handleHookRefresh])

  const handleDownload = useCallback(async () => {
    const currentResult = result || useManualResultsStore.getState().result
    const reportId = sessionReportId // Use stable reportId from selector

    if (!currentResult || !currentResult.html_report) {
      generalLogger.warn('Cannot download PDF: No valuation result or HTML report available', {
        hasResult: !!currentResult,
        hasHtmlReport: !!currentResult?.html_report,
      })
      return
    }

    if (!reportId) {
      generalLogger.error('Cannot download PDF: Report ID not available', {
        reportId,
      })
      return
    }

    setIsDownloading(true)
    try {
      generalLogger.info('Initiating backend PDF download', {
        reportId,
        valuationId: currentResult.valuation_id,
        companyName: currentResult.company_name,
      })

      // Use backend PDF generation endpoint
      const pdfBlob = await backendAPI.downloadAccountantViewPDF(reportId)

      // Generate filename
      const companyName = currentResult.company_name || 'Company'
      const filename = `valuation-${companyName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.pdf`

      // Trigger browser download
      const url = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      trackPDFDownload()
      generalLogger.info('PDF download completed successfully', {
        reportId,
        filename,
        pdfSize: pdfBlob.size,
      })
    } catch (error) {
      if (error instanceof APIError && error.statusCode === 402) {
        toast.error(tToast('pdfDownloadPlanBlocked'), {
          description: error.message || tToast('pdfDownloadPlanBlockedDesc'),
        })
        generalLogger.warn('PDF download blocked by plan', {
          reportId,
          valuationId: currentResult.valuation_id,
        })
        return
      }
      // BANK-GRADE: Specific error handling - PDF download failure
      if (error instanceof Error) {
        generalLogger.error('PDF download failed', {
          error: error.message,
          stack: error.stack,
          reportId,
          valuationId: currentResult.valuation_id,
        })
      } else {
        generalLogger.error('PDF download failed', {
          error: String(error),
          reportId,
          valuationId: currentResult.valuation_id,
        })
      }
    } finally {
      setIsDownloading(false)
    }
  }, [result, sessionReportId, tToast]) // ⚠️ Use stable reportId, not entire session

  return {
    handleRefresh,
    handleDownload,
    isDownloading,
  }
}
