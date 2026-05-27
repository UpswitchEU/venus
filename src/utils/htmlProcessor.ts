import DOMPurify from 'dompurify'
import { generalLogger } from './logger'

/**
 * HTML Processor for sanitizing and processing HTML content
 *
 * WHAT: Sanitizes HTML content to prevent XSS attacks while preserving
 *       server-generated CSS styling for Info Tab reports.
 *
 * WHY:
 * - Security: Prevents XSS attacks from malicious HTML injection
 * - UX: Preserves professional styling from server-generated templates
 * - Bank-Grade: Maintains security while ensuring visual quality
 *
 * HOW:
 * - Extracts CSS before sanitization (fallback mechanism)
 * - Uses DOMPurify with strict configuration for XSS prevention
 * - Re-injects local template CSS if DOMPurify strips style tags (known issue)
 * - Blocks CSS constructs that can execute script or fetch remote resources
 *
 * WHEN: Use for all server-generated HTML content (html_report)
 *
 * SECURITY NOTE: CSS is server-generated from templates, but valuation inputs
 *                can still flow into reports. Re-injected CSS is therefore
 *                blocklisted before it is put back into the DOM.
 *
 * Reference: Based on Ilara Mercury's processedHtml approach
 *            DOMPurify documentation: https://github.com/cure53/DOMPurify
 */
export class HTMLProcessor {
  /**
   * Extract CSS content from style tags in HTML
   *
   * WHAT: Extracts CSS content from <style> tags before sanitization
   * WHY: DOMPurify has a known issue removing style tags when they're
   *      the first element in HTML (GitHub issue #804)
   * HOW: Uses regex to match and extract style tag content
   * WHEN: Called before sanitization as fallback mechanism
   *
   * SECURITY: Extracted CSS must pass sanitizeExtractedCSS before any re-injection.
   *
   * @param htmlContent - HTML string potentially containing <style> tags
   * @returns Object with extracted CSS and HTML without style tags
   */
  private static extractCSS(htmlContent: string): { css: string; html: string } {
    // Match style tags (handles both <style> and <style type="text/css">)
    const styleTagRegex = /<style(?:\s+[^>]*)?>([\s\S]*?)<\/style>/gi
    let cssContent = ''
    let htmlWithoutStyle = htmlContent
    let match

    while ((match = styleTagRegex.exec(htmlContent)) !== null) {
      cssContent += match[1] + '\n'
      htmlWithoutStyle = htmlWithoutStyle.replace(match[0], '')
    }

    return { css: cssContent.trim(), html: htmlWithoutStyle }
  }

  /**
   * Keep report template CSS local and inert before re-injecting it.
   *
   * DOMPurify sanitizes HTML, not arbitrary CSS that we put back after the
   * sanitizer has run. Reports do not need remote CSS imports, CSS url()
   * fetches, legacy expression(), or markup inside style tags, so fail closed
   * for those constructs.
   */
  private static sanitizeExtractedCSS(cssContent: string): string {
    if (!cssContent) return ''

    const trimmed = Array.from(cssContent)
      .filter((character) => {
        const code = character.charCodeAt(0)
        return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
      })
      .join('')
      .trim()

    if (!trimmed) return ''

    // Strip @import / @font-face surgically before the unsafe-pattern check.
    // The valuation-iq template loads remote font CDNs via
    // `@import url('https://fonts.googleapis.com/...')` at the top of its
    // `<style>` block; under the previous whole-block policy this single line
    // tripped /@import/ and /url\s*\(/ and the entire stylesheet was dropped,
    // leaving the embedded report (cover page, every inner page) with no CSS
    // at all. Mercury fixed the same regression in
    // apps/mercury/shared/utils/sanitize-html.ts — this mirrors that approach
    // so both apps stay in sync.
    //
    // External font fetches wouldn't work reliably from a `<style>` injected
    // via `dangerouslySetInnerHTML` anyway; the report's font stack falls
    // back to the Inter/system-ui chain already declared in the stylesheet,
    // so dropping `@import`/`@font-face` is functionally a no-op for the
    // embedded view.
    const withoutImports = trimmed
      .replace(/@import\s+url\([^)]*\)[^;]*;?/gi, '')
      .replace(/@import\s+["'][^"']*["'][^;]*;?/gi, '')
      .replace(/@font-face\s*\{[^}]*\}/gi, '')
      .trim()
    if (!withoutImports) return ''

    const normalizedForPolicy = withoutImports.replace(/\/\*[\s\S]*?\*\//g, '').toLowerCase()
    const unsafeCssPatterns = [
      /<[^>]+>/,
      /<\/?\s*style\b/,
      /<\/?\s*script\b/,
      /@import\b/,
      /url\s*\(/,
      /expression\s*\(/,
      /javascript\s*:/,
      /vbscript\s*:/,
      /data\s*:/,
      /-moz-binding\s*:/,
    ]

    if (unsafeCssPatterns.some((pattern) => pattern.test(normalizedForPolicy))) {
      if (process.env.NODE_ENV === 'development') {
        generalLogger.warn('[HTMLProcessor] Unsafe report CSS stripped before re-injection', {
          cssLength: cssContent.length,
        })
      }
      return ''
    }

    return withoutImports
  }

  /**
   * Sanitize HTML content to prevent XSS attacks
   *
   * WHAT: Sanitizes HTML using DOMPurify with strict configuration,
   *       preserving server-generated CSS styling via fallback mechanism
   *
   * WHY:
   * - XSS Prevention: DOMPurify removes malicious scripts and dangerous HTML
   * - CSS Preservation: Ensures Info Tab styling is always applied
   * - Bank-Grade Security: Maintains security while preserving UX quality
   *
   * HOW:
   * 1. Extract CSS before sanitization (fallback for DOMPurify limitation)
   * 2. Sanitize HTML with DOMPurify (strict XSS prevention)
   * 3. Re-inject vetted CSS if DOMPurify stripped style tags
   * 4. Return sanitized HTML with preserved CSS
   *
   * WHEN: Called for all server-generated HTML before rendering
   *
   * SECURITY:
   * - DOMPurify configuration: Strict whitelist of allowed tags/attributes
   * - CSS re-injection: Local template CSS only; remote/script-capable CSS is stripped
   *
   * REFERENCE:
   * - DOMPurify GitHub Issue #804: Style tag removal when first element
   * - Frontend Refactoring Guide: XSS Prevention section
   * - Bank-Grade Framework: Security & Compliance requirements
   *
   * @param htmlContent - HTML string to sanitize (server-generated)
   * @returns Sanitized HTML with preserved CSS styling
   */
  static sanitize(htmlContent: string): string {
    if (!htmlContent) return ''

    // BANK-GRADE: Type validation - ensure input is string
    if (typeof htmlContent !== 'string') {
      if (process.env.NODE_ENV === 'development') {
        generalLogger.warn('[HTMLProcessor] Invalid input type for sanitize', {
          type: typeof htmlContent,
          expected: 'string',
        })
      }
      return '' // Fail-safe: return empty string for invalid input
    }

    // BANK-GRADE: Extract CSS before sanitization to preserve it
    // DOMPurify has a known issue removing style tags when they're the first element
    // Reference: https://github.com/cure53/DOMPurify/issues/804
    let extractedCSS = ''
    let htmlWithoutStyle = htmlContent
    let hadStyleTag = false

    try {
      const extractionResult = this.extractCSS(htmlContent)
      extractedCSS = this.sanitizeExtractedCSS(extractionResult.css)
      htmlWithoutStyle = extractionResult.html
      hadStyleTag = extractedCSS.length > 0
    } catch (error) {
      // BANK-GRADE: Specific error handling - CSS extraction failure
      // This is non-critical - continue with sanitization without CSS extraction
      if (process.env.NODE_ENV === 'development') {
        generalLogger.warn(
          '[HTMLProcessor] CSS extraction failed, continuing without CSS fallback',
          {
            error: error instanceof Error ? error.message : String(error),
          }
        )
      }
      // Continue with original HTML for sanitization
      htmlWithoutStyle = htmlContent
      hadStyleTag = false
    }

    // Sanitize HTML without style tags first
    // BANK-GRADE: Strict DOMPurify configuration for XSS prevention
    // Reference: Frontend Refactoring Guide - Security & Compliance section
    let sanitized: string

    try {
      sanitized = DOMPurify.sanitize(htmlWithoutStyle, {
        // Allow common HTML tags for reports
        ALLOWED_TAGS: [
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'p',
          'div',
          'span',
          'strong',
          'em',
          'b',
          'i',
          'u',
          'ul',
          'ol',
          'li',
          'br',
          'hr',
          'table',
          'thead',
          'tbody',
          'tfoot',
          'tr',
          'th',
          'td',
          'caption',
          'colgroup',
          'col',
          'a',
          'img',
          'blockquote',
          'pre',
          'code',
          'section',
          'article',
          'header',
          'footer',
          'nav',
          'main',
          'aside',
          'figure',
          'figcaption',
          'style',
          // SVG elements for charts (waterfall, sensitivity)
          'svg',
          'g',
          'rect',
          'circle',
          'ellipse',
          'line',
          'polyline',
          'polygon',
          'path',
          'text',
          'tspan',
          'defs',
          'clippath',
          'lineargradient',
          'radialgradient',
          'stop',
          'use',
          'symbol',
          'marker',
          'pattern',
          'mask',
        ],
        ALLOWED_ATTR: [
          'class',
          'id',
          'style',
          'href',
          'src',
          'alt',
          'title',
          'colspan',
          'rowspan',
          'align',
          'valign',
          'type',
          'media',
          'width',
          'height',
          // SVG attributes for charts
          'viewbox',
          'fill',
          'stroke',
          'stroke-width',
          'stroke-linecap',
          'stroke-linejoin',
          'stroke-dasharray',
          'stroke-dashoffset',
          'opacity',
          'x',
          'y',
          'x1',
          'y1',
          'x2',
          'y2',
          'cx',
          'cy',
          'r',
          'rx',
          'ry',
          'd',
          'points',
          'transform',
          'text-anchor',
          'dominant-baseline',
          'font-size',
          'font-weight',
          'font-family',
          'dx',
          'dy',
          'offset',
          'stop-color',
          'stop-opacity',
          'clip-path',
          'mask',
          'marker-start',
          'marker-end',
          'xmlns',
          'xmlns:xlink',
          'role',
          'aria-label',
          'aria-hidden',
        ],
        // Allow data attributes for custom functionality
        ALLOW_DATA_ATTR: true,
        // Keep relative URLs
        ALLOW_UNKNOWN_PROTOCOLS: false,
        // BANK-GRADE: Preserve style tags and their content
        FORCE_BODY: true, // Ensures style tags are properly preserved when at start of HTML
        KEEP_CONTENT: true, // Preserve content of allowed elements (including CSS in style tags)
        // Note: DOMPurify preserves CSS content within style tags when style is in ALLOWED_TAGS
        // Since our CSS is server-generated from templates (not user input), this is safe
      })
    } catch (error) {
      // BANK-GRADE: Specific error handling - DOMPurify sanitization failure
      // DOMPurify typically doesn't throw, but handle edge cases (SSR, invalid config)
      if (process.env.NODE_ENV === 'development') {
        generalLogger.error('[HTMLProcessor] DOMPurify sanitization failed', {
          error: error instanceof Error ? error.message : String(error),
          htmlLength: htmlWithoutStyle.length,
          fallback: 'returning empty string',
        })
      }
      // Fail-safe: Return empty string if sanitization fails
      // This prevents XSS but loses content - better than rendering unsafe HTML
      return ''
    }

    // BANK-GRADE: Validate sanitized output
    if (typeof sanitized !== 'string') {
      if (process.env.NODE_ENV === 'development') {
        generalLogger.warn('[HTMLProcessor] DOMPurify returned non-string, using fallback', {
          type: typeof sanitized,
        })
      }
      return '' // Fail-safe: return empty string
    }

    // BANK-GRADE: Re-inject CSS if it was extracted (fallback mechanism)
    // This ensures CSS is always applied even if DOMPurify strips style tags
    if (hadStyleTag && extractedCSS.length > 0) {
      // Check if style tag is still present after sanitization
      const hasStyleTagAfter = sanitized.includes('<style>') || sanitized.includes('<style ')

      if (!hasStyleTagAfter) {
        // Re-inject CSS as a style tag at the beginning
        // This ensures approved local template CSS is applied even if DOMPurify removed it
        const result = `<style>${extractedCSS}</style>${sanitized}`

        // BANK-GRADE: Log CSS re-injection for security audit trail
        // This is safe because CSS is server-generated (not user input)
        if (process.env.NODE_ENV === 'development') {
          generalLogger.info('[HTMLProcessor] CSS extracted and re-injected (DOMPurify fallback)', {
            cssLength: extractedCSS.length,
            htmlLength: sanitized.length,
            finalLength: result.length,
            reason: 'DOMPurify stripped style tag (known issue #804)',
            securityNote: 'CSS passed report CSS policy before re-injection',
          })
        }

        return result
      } else {
        // Style tag was preserved by DOMPurify - log success for monitoring
        if (process.env.NODE_ENV === 'development') {
          generalLogger.info('[HTMLProcessor] Style tag preserved by DOMPurify', {
            cssLength: extractedCSS.length,
            htmlLength: sanitized.length,
            status: 'success',
          })
        }
      }
    }

    return sanitized
  }

  /**
   * Process HTML content with additional enhancements
   */
  static process(htmlContent: string): string {
    if (!htmlContent) return ''

    // First sanitize the content
    let processed = this.sanitize(htmlContent)

    // DISABLED: We now use global CSS (.valuation-report-preview) to match backend styles exactly.
    // This prevents the injection of generic Tailwind classes that conflict with our Bank-Grade design.
    // Previously used: addReportStyling() - removed to avoid TypeScript errors

    // Process links to open in new tabs
    processed = this.processLinks(processed)

    // DISABLED: Backend handles table responsiveness/layout.
    // Previously used: addResponsiveTables() - removed to avoid TypeScript errors

    return processed
  }

  /**
   * Process links to open in new tabs
   */
  private static processLinks(html: string): string {
    return html.replace(/<a\s+href=/g, '<a target="_blank" rel="noopener noreferrer" href=')
  }

  /**
   * Extract sections from HTML for table of contents
   *
   * WHAT: Parses HTML to extract heading elements (h2, h3, h4) for TOC generation
   * WHY: Provides navigation structure for long-form reports
   * HOW: Uses DOMParser to parse HTML and extract headings
   * WHEN: Called when generating table of contents for reports
   *
   * BANK-GRADE: Type validation and error handling for robust parsing
   *
   * @param htmlContent - HTML string to parse
   * @returns Array of section objects with id, title, and level
   */
  static extractSections(htmlContent: string): Array<{ id: string; title: string; level: number }> {
    if (!htmlContent) return []

    // BANK-GRADE: Type validation
    if (typeof htmlContent !== 'string') {
      if (process.env.NODE_ENV === 'development') {
        generalLogger.warn('[HTMLProcessor] Invalid input type for extractSections', {
          type: typeof htmlContent,
        })
      }
      return []
    }

    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(htmlContent, 'text/html')
      const headings = doc.querySelectorAll('h2, h3, h4')

      return Array.from(headings).map((h, idx) => ({
        id: `section-${idx}`,
        title: h.textContent || '',
        level: parseInt(h.tagName.charAt(1), 10) || 2, // Default to h2 if parsing fails
      }))
    } catch (error) {
      // BANK-GRADE: Specific error handling - DOMParser failure
      // This is non-critical - return empty array if parsing fails
      if (process.env.NODE_ENV === 'development') {
        generalLogger.warn('[HTMLProcessor] Failed to extract sections from HTML', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return []
    }
  }

  /**
   * Check if HTML content is safe to render
   */
  static isSafe(htmlContent: string): boolean {
    if (!htmlContent) return true

    const sanitized = this.sanitize(htmlContent)
    return sanitized === htmlContent
  }
}
