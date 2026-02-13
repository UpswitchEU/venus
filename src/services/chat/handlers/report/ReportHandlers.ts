/**
 * Report Handlers - Focused event handlers for report-related streaming events
 *
 * Single Responsibility: Handle report updates, sections, and completion events
 * Extracted from StreamEventHandler to follow SRP
 *
 * @module services/chat/handlers/report/ReportHandlers
 */

import { chatLogger } from '../../../../utils/logger'
import { StreamEventHandlerCallbacks } from '../../StreamEventHandler'

export class ReportHandlers {
  private callbacks: StreamEventHandlerCallbacks

  constructor(callbacks: StreamEventHandlerCallbacks) {
    this.callbacks = callbacks
  }

  /**
   * Handle report update events
   */
  handleReportUpdate(data: any): void {
    const html = data.html || data.content || ''
    const progress = data.progress || 0

    chatLogger.info('Report update received', {
      progress,
      htmlLength: html.length,
      hasHtml: !!html,
    })

    this.callbacks.onReportUpdate?.(html, progress)
  }

  /**
   * Handle section loading events
   */
  handleSectionLoading(data: any): void {
    const section = data.section || data.section_name || 'unknown'
    const html = data.html || data.content || ''
    const phase = data.phase || 0
    const sectionData = data.data || data.metadata || {}

    chatLogger.info('Report section loading', {
      section,
      phase,
      htmlLength: html.length,
      dataKeys: Object.keys(sectionData),
    })

    this.callbacks.onSectionLoading?.(section, html, phase, sectionData)
  }

  /**
   * Handle section complete events
   */
  handleSectionComplete(data: any): void {
    const sectionId = data.section_id || data.section || 'unknown'
    const sectionName = data.section_name || data.name || sectionId
    const html = data.html || data.content || ''
    const progress = data.progress || 0
    const phase = data.phase

    chatLogger.info('Report section completed', {
      sectionId,
      sectionName,
      progress,
      phase,
      htmlLength: html.length,
    })

    this.callbacks.onSectionComplete?.({
      sectionId,
      sectionName,
      html,
      progress,
      phase,
    })
  }

  /**
   * Handle report section events
   */
  handleReportSection(data: any): void {
    const section = data.section || data.section_name || 'unknown'
    const html = data.html || data.content || ''
    const phase = data.phase || 0
    const progress = data.progress || 0
    const isFallback = data.is_fallback || false
    const isError = data.is_error || false
    const errorMessage = data.error_message || data.error || ''

    chatLogger.info('Report section update', {
      section,
      phase,
      progress,
      isFallback,
      isError,
      htmlLength: html.length,
      hasErrorMessage: !!errorMessage,
    })

    this.callbacks.onReportSectionUpdate?.(
      section,
      html,
      phase,
      progress,
      isFallback,
      isError,
      errorMessage
    )
  }

  /**
   * Handle report complete events
   */
  handleReportComplete(data: any): void {
    const html = data.html || data.content || ''
    const valuationId = data.valuation_id || data.id || ''

    chatLogger.info('Report completed', {
      valuationId,
      htmlLength: html.length,
      hasValuationId: !!valuationId,
    })

    this.callbacks.onReportComplete?.(html, valuationId)
  }
}
