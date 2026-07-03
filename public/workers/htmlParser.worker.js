/**
 * HTML Parser Web Worker
 * 
 * Parses and processes large HTML reports in a background thread.
 * Prevents blocking the main thread during heavy DOM parsing.
 * 
 * Messages:
 * - parseHTML: Parse HTML string and extract metadata
 * - sanitizeHTML: Sanitize HTML for security
 * - extractText: Extract plain text from HTML
 * - analyzeStructure: Analyze HTML document structure
 * 
 * @module workers/htmlParser
 */

// Worker scope
/* global self, DOMParser, XMLSerializer */

/**
 * Parse HTML and extract metadata
 */
function parseHTML(html) {
  const startTime = performance.now()

  // Create a DOM parser
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Extract metadata
  const metadata = {
    title: doc.title || '',
    headings: [],
    links: [],
    images: [],
    tables: [],
    wordCount: 0,
    byteSize: new Blob([html]).size,
  }

  // Extract headings
  doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    metadata.headings.push({
      level: parseInt(heading.tagName.substring(1)),
      text: heading.textContent.trim(),
      id: heading.id || null,
    })
  })

  // Extract links
  doc.querySelectorAll('a[href]').forEach((link) => {
    metadata.links.push({
      href: link.href,
      text: link.textContent.trim(),
    })
  })

  // Extract images
  doc.querySelectorAll('img').forEach((img) => {
    metadata.images.push({
      src: img.src,
      alt: img.alt || '',
    })
  })

  // Extract tables
  doc.querySelectorAll('table').forEach((table) => {
    metadata.tables.push({
      rows: table.rows.length,
      columns: table.rows[0]?.cells.length || 0,
    })
  })

  // Count words
  const text = doc.body.textContent || ''
  metadata.wordCount = text.split(/\s+/).filter((word) => word.length > 0).length

  const duration = performance.now() - startTime

  return {
    metadata,
    duration_ms: Math.round(duration),
  }
}

/**
 * Sanitize HTML for security
 * Basic sanitization - removes scripts, iframes, etc.
 */
function sanitizeHTML(html) {
  const startTime = performance.now()

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Remove dangerous elements
  const dangerousTags = ['script', 'iframe', 'object', 'embed', 'link']
  dangerousTags.forEach((tag) => {
    doc.querySelectorAll(tag).forEach((el) => el.remove())
  })

  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim().toLowerCase()
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name)
        continue
      }
      if ((name === 'href' || name === 'src' || name === 'xlink:href') && isUnsafeUrl(value)) {
        el.removeAttribute(attr.name)
      }
    }
  })

  const sanitized = `<!DOCTYPE html>\n${new XMLSerializer().serializeToString(doc.documentElement)}`
  const duration = performance.now() - startTime

  return {
    html: sanitized,
    duration_ms: Math.round(duration),
  }
}

function isUnsafeUrl(value) {
  return (
    value.startsWith('javascript:') ||
    value.startsWith('vbscript:') ||
    value.startsWith('data:text/html') ||
    value.startsWith('data:application/xhtml')
  )
}

/**
 * Extract plain text from HTML
 */
function extractText(html) {
  const startTime = performance.now()

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const text = doc.body.textContent || ''
  const duration = performance.now() - startTime

  return {
    text,
    length: text.length,
    wordCount: text.split(/\s+/).filter((word) => word.length > 0).length,
    duration_ms: Math.round(duration),
  }
}

/**
 * Analyze HTML document structure
 */
function analyzeStructure(html) {
  const startTime = performance.now()

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const structure = {
    totalElements: doc.querySelectorAll('*').length,
    depth: calculateDepth(doc.body),
    sections: doc.querySelectorAll('section').length,
    articles: doc.querySelectorAll('article').length,
    divs: doc.querySelectorAll('div').length,
    paragraphs: doc.querySelectorAll('p').length,
    lists: doc.querySelectorAll('ul, ol').length,
    tables: doc.querySelectorAll('table').length,
    forms: doc.querySelectorAll('form').length,
  }

  const duration = performance.now() - startTime

  return {
    structure,
    duration_ms: Math.round(duration),
  }
}

/**
 * Calculate DOM tree depth
 */
function calculateDepth(element) {
  if (!element || !element.children || element.children.length === 0) {
    return 0
  }

  let maxDepth = 0
  for (let i = 0; i < element.children.length; i++) {
    const childDepth = calculateDepth(element.children[i])
    maxDepth = Math.max(maxDepth, childDepth)
  }

  return maxDepth + 1
}

// Message handler
self.addEventListener('message', (event) => {
  const { id, type, html } = event.data

  try {
    let result

    switch (type) {
      case 'parseHTML':
        result = parseHTML(html)
        break

      case 'sanitizeHTML':
        result = sanitizeHTML(html)
        break

      case 'extractText':
        result = extractText(html)
        break

      case 'analyzeStructure':
        result = analyzeStructure(html)
        break

      default:
        throw new Error(`Unknown message type: ${type}`)
    }

    self.postMessage({
      id,
      type,
      success: true,
      result,
    })
  } catch (error) {
    self.postMessage({
      id,
      type,
      success: false,
      error: error.message,
    })
  }
})

// Ready signal
self.postMessage({ type: 'ready' })
