import { describe, expect, it } from 'vitest'
import { streamHTMLForReact, streamHTMLToElement } from './streamingHTML'

describe('streamingHTML', () => {
  it('streams sanitized DOM nodes into a target element', async () => {
    const root = document.createElement('div')

    await streamHTMLToElement(
      '<section><p>Safe</p><img src="x" onerror="alert(1)"><script>alert(1)</script></section>',
      root,
      { chunkSize: 8 }
    )

    expect(root.textContent).toContain('Safe')
    expect(root.querySelector('script')).toBeNull()
    expect(root.querySelector('img')?.hasAttribute('onerror')).toBe(false)
  })

  it('delivers sanitized chunks for React consumers', async () => {
    const chunks: string[] = []

    await streamHTMLForReact(
      '<p>Safe</p><img src="x" onerror="alert(1)"><script>alert(1)</script>',
      (chunk) => chunks.push(chunk),
      { chunkSize: 8 }
    )

    const html = chunks.join('')
    expect(html).toContain('Safe')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror')
  })
})
