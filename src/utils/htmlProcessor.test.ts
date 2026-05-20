import { describe, expect, it, vi } from 'vitest'
import { HTMLProcessor } from './htmlProcessor'

vi.mock('./logger', () => ({
  generalLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('HTMLProcessor', () => {
  it('removes executable HTML from report content', () => {
    const sanitized = HTMLProcessor.sanitize(
      '<section><img src="x" onerror="alert(1)"><script>alert(1)</script><p>Safe</p></section>'
    )

    expect(sanitized).toContain('Safe')
    expect(sanitized).not.toContain('onerror')
    expect(sanitized).not.toContain('<script')
  })

  it('preserves inert local report CSS', () => {
    const sanitized = HTMLProcessor.sanitize(
      '<style>.valuation-total{color:#123456}</style><div class="valuation-total">Total</div>'
    )

    expect(sanitized).toContain('<style>.valuation-total{color:#123456}</style>')
    expect(sanitized).toContain('Total')
  })

  it('does not re-inject CSS that can execute or fetch resources', () => {
    const sanitized = HTMLProcessor.sanitize(
      '<style>.x{background:url(javascript:alert(1))}</style><div class="x">Total</div>'
    )

    expect(sanitized).toContain('Total')
    expect(sanitized).not.toContain('<style>')
    expect(sanitized).not.toContain('javascript:')
    expect(sanitized).not.toContain('url(')
  })

  it('does not re-inject markup smuggled through style content', () => {
    const sanitized = HTMLProcessor.sanitize(
      '<style>.x{} <script>alert(1)</script></style><div class="x">Total</div>'
    )

    expect(sanitized).toContain('Total')
    expect(sanitized).not.toContain('<script')
    expect(sanitized).not.toContain('<style>')
  })
})
