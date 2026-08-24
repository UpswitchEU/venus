/**
 * Streaming HTML Utility
 *
 * Progressively renders large HTML content to avoid blocking the main thread.
 * Useful for 20-30 page reports that would otherwise cause janky rendering.
 *
 * Benefits:
 * - No layout blocking for large documents
 * - Users see content immediately
 * - Smooth scrolling during render
 * - Better perceived performance
 *
 * @module utils/streamingHTML
 */

import { HTMLProcessor } from './htmlProcessor'
import { generalLogger } from './logger'

/**
 * Configuration for HTML streaming
 */
export interface StreamingHTMLConfig {
  /**
   * Size of each chunk in characters
   * Default: 50000 (50KB per chunk)
   */
  chunkSize?: number

  /**
   * Delay between chunks in milliseconds
   * Default: 0 (yield to main thread but render ASAP)
   */
  delay?: number

  /**
   * Callback for progress updates
   */
  onProgress?: (progress: number) => void

  /**
   * Callback when chunk is rendered
   */
  onChunk?: (chunkIndex: number, totalChunks: number) => void
}

/**
 * Async generator that yields HTML chunks
 * Allows progressive rendering of large HTML content
 *
 * @param htmlContent - Full HTML string to stream
 * @param config - Streaming configuration
 */
export async function* streamHTMLChunks(
  htmlContent: string,
  config: StreamingHTMLConfig = {}
): AsyncGenerator<string, void, unknown> {
  const { chunkSize = 50000, delay = 0, onProgress, onChunk } = config

  if (!htmlContent || htmlContent.length === 0) {
    generalLogger.warn('[StreamingHTML] Empty HTML content provided')
    return
  }

  const totalLength = htmlContent.length
  const totalChunks = Math.ceil(totalLength / chunkSize)

  generalLogger.info('[StreamingHTML] Starting HTML streaming', {
    totalLength,
    chunkSize,
    totalChunks,
    delay_ms: delay,
  })

  for (let i = 0; i < totalLength; i += chunkSize) {
    const chunk = htmlContent.slice(i, i + chunkSize)
    const chunkIndex = Math.floor(i / chunkSize)
    const progress = Math.min(100, Math.round(((i + chunkSize) / totalLength) * 100))

    // Yield chunk
    yield chunk

    // Callbacks
    onProgress?.(progress)
    onChunk?.(chunkIndex + 1, totalChunks)

    // Yield to main thread (allows UI to stay responsive)
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    } else {
      // Yield to event loop (0ms delay)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    generalLogger.debug('[StreamingHTML] Chunk rendered', {
      chunkIndex: chunkIndex + 1,
      totalChunks,
      progress,
    })
  }

  generalLogger.info('[StreamingHTML] Streaming complete', {
    totalLength,
    totalChunks,
  })
}

/**
 * Stream HTML into a DOM element
 * Progressively appends HTML chunks to the target element
 *
 * @param htmlContent - Full HTML string to stream
 * @param targetElement - DOM element to append chunks to
 * @param config - Streaming configuration
 */
export async function streamHTMLToElement(
  htmlContent: string,
  targetElement: HTMLElement,
  config: StreamingHTMLConfig = {}
): Promise<void> {
  const { chunkSize = 50000, delay = 0, onProgress, onChunk } = config
  targetElement.replaceChildren()

  try {
    const sanitizedFragment = HTMLProcessor.sanitizeToFragment(
      htmlContent,
      targetElement.ownerDocument
    )
    const nodes = Array.from(sanitizedFragment.childNodes)
    if (nodes.length === 0) {
      onProgress?.(100)
      generalLogger.info('[StreamingHTML] Empty sanitized content rendered to element')
      return
    }

    const estimatedChunks = Math.max(1, Math.ceil(htmlContent.length / chunkSize))
    const nodesPerChunk = Math.max(1, Math.ceil(nodes.length / estimatedChunks))
    const totalChunks = Math.ceil(nodes.length / nodesPerChunk)

    for (let index = 0; index < nodes.length; index += nodesPerChunk) {
      const chunkIndex = Math.floor(index / nodesPerChunk)
      const fragment = targetElement.ownerDocument.createDocumentFragment()
      const chunkNodes = nodes.slice(index, index + nodesPerChunk)

      for (const node of chunkNodes) {
        fragment.appendChild(node)
      }

      targetElement.appendChild(fragment)
      const progress = Math.min(100, Math.round(((chunkIndex + 1) / totalChunks) * 100))
      onProgress?.(progress)
      onChunk?.(chunkIndex + 1, totalChunks)

      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    generalLogger.info('[StreamingHTML] Content fully rendered to element')
  } catch (error) {
    generalLogger.error('[StreamingHTML] Streaming failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Stream sanitized HTML content with React.
 * Returns sanitized string chunks as they're ready for React rendering.
 *
 * Usage:
 * ```tsx
 * const [htmlChunks, setHtmlChunks] = useState<string[]>([])
 *
 * useEffect(() => {
 *   streamHTMLForReact(htmlReport, (chunk) => {
 *     setHtmlChunks(prev => [...prev, chunk])
 *   })
 * }, [htmlReport])
 *
 * return <pre>{htmlChunks.join('')}</pre>
 * ```
 *
 * @param htmlContent - Full HTML string to stream
 * @param onChunk - Callback when chunk is ready
 * @param config - Streaming configuration
 */
export async function streamHTMLForReact(
  htmlContent: string,
  onChunk: (chunk: string, index: number) => void,
  config: StreamingHTMLConfig = {}
): Promise<void> {
  let chunkIndex = 0

  try {
    const sanitizedHtml = HTMLProcessor.sanitize(htmlContent)
    for await (const chunk of streamHTMLChunks(sanitizedHtml, config)) {
      onChunk(chunk, chunkIndex)
      chunkIndex++
    }

    generalLogger.info('[StreamingHTML] All chunks delivered to React', {
      totalChunks: chunkIndex,
    })
  } catch (error) {
    generalLogger.error('[StreamingHTML] React streaming failed', {
      error: error instanceof Error ? error.message : String(error),
      chunksDelivered: chunkIndex,
    })
    throw error
  }
}

/**
 * Check if HTML content is large enough to benefit from streaming
 *
 * @param htmlContent - HTML string to check
 * @param threshold - Size threshold in characters (default: 100000 = 100KB)
 * @returns True if streaming is recommended
 */
export function shouldStreamHTML(htmlContent: string, threshold: number = 100000): boolean {
  return htmlContent.length > threshold
}

/**
 * Split HTML at safe boundaries (not mid-tag)
 * Ensures chunks don't break HTML structure
 *
 * @param htmlContent - HTML string to split
 * @param chunkSize - Approximate size of each chunk
 * @returns Array of HTML chunks split at safe boundaries
 */
export function splitHTMLSafely(htmlContent: string, chunkSize: number = 50000): string[] {
  const chunks: string[] = []
  let currentIndex = 0

  while (currentIndex < htmlContent.length) {
    let endIndex = Math.min(currentIndex + chunkSize, htmlContent.length)

    // If we're not at the end, find a safe split point
    if (endIndex < htmlContent.length) {
      // Look for closing tag after chunk boundary
      const nextClosingTag = htmlContent.indexOf('>', endIndex)

      if (nextClosingTag !== -1 && nextClosingTag - endIndex < 1000) {
        // If closing tag is within 1000 chars, use it
        endIndex = nextClosingTag + 1
      } else {
        // Otherwise, try to find previous closing tag
        const prevClosingTag = htmlContent.lastIndexOf('>', endIndex)
        if (prevClosingTag > currentIndex) {
          endIndex = prevClosingTag + 1
        }
      }
    }

    const chunk = htmlContent.slice(currentIndex, endIndex)
    chunks.push(chunk)
    currentIndex = endIndex
  }

  generalLogger.debug('[StreamingHTML] HTML split into safe chunks', {
    totalLength: htmlContent.length,
    chunkCount: chunks.length,
    avgChunkSize: Math.round(htmlContent.length / chunks.length),
  })

  return chunks
}

/**
 * Estimate rendering time for HTML content
 * Helps decide whether to stream or render all at once
 *
 * @param htmlContent - HTML string to estimate
 * @returns Estimated render time in milliseconds
 */
export function estimateRenderTime(htmlContent: string): number {
  // Rough estimate: 1ms per 10KB
  const sizeInKB = htmlContent.length / 1000
  const estimatedMs = sizeInKB / 10

  return Math.round(estimatedMs)
}
