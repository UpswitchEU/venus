/**
 * HTML Parser Worker Client
 *
 * TypeScript wrapper for the HTML Parser Web Worker.
 * Provides a Promise-based API for background HTML processing.
 *
 * @module utils/htmlParserWorker
 */

import { generalLogger } from './logger'

export interface HTMLMetadata {
  title: string
  headings: Array<{ level: number; text: string; id: string | null }>
  links: Array<{ href: string; text: string }>
  images: Array<{ src: string; alt: string }>
  tables: Array<{ rows: number; columns: number }>
  wordCount: number
  byteSize: number
}

export interface HTMLParseResult {
  metadata: HTMLMetadata
  duration_ms: number
}

export interface HTMLSanitizeResult {
  html: string
  duration_ms: number
}

export interface HTMLTextResult {
  text: string
  length: number
  wordCount: number
  duration_ms: number
}

export interface HTMLStructureResult {
  structure: {
    totalElements: number
    depth: number
    sections: number
    articles: number
    divs: number
    paragraphs: number
    lists: number
    tables: number
    forms: number
  }
  duration_ms: number
}

/**
 * HTML Parser Worker Client
 * Manages Web Worker lifecycle and message passing
 */
class HTMLParserWorkerClient {
  private worker: Worker | null = null
  private messageId = 0
  private pendingRequests = new Map<
    number,
    {
      resolve: (result: unknown) => void
      reject: (error: Error) => void
    }
  >()

  /**
   * Initialize the worker
   */
  private async init(): Promise<void> {
    if (this.worker) {
      return // Already initialized
    }

    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker('/workers/htmlParser.worker.js')

        this.worker.addEventListener('message', (event) => {
          const { id, type, success, result, error } = event.data

          if (type === 'ready') {
            generalLogger.info('[HTMLParserWorker] Worker ready')
            resolve()
            return
          }

          const request = this.pendingRequests.get(id)
          if (request) {
            this.pendingRequests.delete(id)

            if (success) {
              request.resolve(result)
            } else {
              request.reject(new Error(error))
            }
          }
        })

        this.worker.addEventListener('error', (error) => {
          generalLogger.error('[HTMLParserWorker] Worker error', {
            error: error.message,
          })
          reject(error)
        })
      } catch (error) {
        generalLogger.error('[HTMLParserWorker] Failed to initialize', {
          error: error instanceof Error ? error.message : String(error),
        })
        reject(error)
      }
    })
  }

  /**
   * Send message to worker and wait for response
   */
  private async sendMessage<T>(type: string, html: string): Promise<T> {
    await this.init()

    if (!this.worker) {
      throw new Error('Worker not initialized')
    }

    return new Promise((resolve, reject) => {
      const id = this.messageId++

      this.pendingRequests.set(id, {
        resolve: (result) => resolve(result as T),
        reject,
      })

      this.worker?.postMessage({ id, type, html })

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('Worker request timeout'))
        }
      }, 30000)
    })
  }

  /**
   * Parse HTML and extract metadata
   */
  async parseHTML(html: string): Promise<HTMLParseResult> {
    generalLogger.debug('[HTMLParserWorker] Parsing HTML', {
      size_bytes: new Blob([html]).size,
    })

    const result = await this.sendMessage<HTMLParseResult>('parseHTML', html)

    generalLogger.info('[HTMLParserWorker] HTML parsed', {
      duration_ms: result.duration_ms,
      word_count: result.metadata.wordCount,
      headings: result.metadata.headings.length,
    })

    return result
  }

  /**
   * Sanitize HTML for security
   */
  async sanitizeHTML(html: string): Promise<HTMLSanitizeResult> {
    generalLogger.debug('[HTMLParserWorker] Sanitizing HTML', {
      size_bytes: new Blob([html]).size,
    })

    const result = await this.sendMessage<HTMLSanitizeResult>('sanitizeHTML', html)

    generalLogger.info('[HTMLParserWorker] HTML sanitized', {
      duration_ms: result.duration_ms,
    })

    return result
  }

  /**
   * Extract plain text from HTML
   */
  async extractText(html: string): Promise<HTMLTextResult> {
    generalLogger.debug('[HTMLParserWorker] Extracting text from HTML')

    const result = await this.sendMessage<HTMLTextResult>('extractText', html)

    generalLogger.info('[HTMLParserWorker] Text extracted', {
      duration_ms: result.duration_ms,
      word_count: result.wordCount,
    })

    return result
  }

  /**
   * Analyze HTML document structure
   */
  async analyzeStructure(html: string): Promise<HTMLStructureResult> {
    generalLogger.debug('[HTMLParserWorker] Analyzing HTML structure')

    const result = await this.sendMessage<HTMLStructureResult>('analyzeStructure', html)

    generalLogger.info('[HTMLParserWorker] Structure analyzed', {
      duration_ms: result.duration_ms,
      total_elements: result.structure.totalElements,
      depth: result.structure.depth,
    })

    return result
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
      this.pendingRequests.clear()

      generalLogger.info('[HTMLParserWorker] Worker terminated')
    }
  }
}

// Export singleton instance
export const htmlParserWorker = new HTMLParserWorkerClient()
