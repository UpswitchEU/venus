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

  it('keeps the rest of the stylesheet when @import font CDNs are present', () => {
    // Regression: the valuation-iq main_report template starts its <style>
    // block with `@import url('https://fonts.googleapis.com/...')`. The old
    // sanitizer dropped the entire stylesheet on first `@import` / `url(` and
    // the embedded cover page rendered unstyled.
    const sanitized = HTMLProcessor.sanitize(
      `<style>
        @import url('https://api.fontshare.com/v2/css?f[]=satoshi@400&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400');
        .valuation-report { --report-teal: 172 55% 45%; --space-1: 4pt; }
        .valuation-report .cover-page { background: hsl(225 18% 8%); padding: var(--space-1); }
        .valuation-report .cover-company-name { color: #f4f1ea; }
      </style>
      <div class="valuation-report"><div class="cover-page"><h1 class="cover-company-name">Acme</h1></div></div>`
    )

    expect(sanitized).toContain('.cover-page')
    expect(sanitized).toContain('cover-company-name')
    expect(sanitized).toContain('--space-1')
    expect(sanitized).toContain('--report-teal')
    expect(sanitized).toContain('Acme')
    expect(sanitized).not.toContain('@import')
    expect(sanitized).not.toContain('fonts.googleapis.com')
  })

  it('strips @font-face but keeps the rest of the stylesheet', () => {
    const sanitized = HTMLProcessor.sanitize(
      `<style>
        @font-face { font-family: 'Satoshi'; src: url('https://example.com/satoshi.woff2'); }
        .valuation-report { color: hsl(172 55% 45%); }
      </style>
      <div class="valuation-report">Hi</div>`
    )

    expect(sanitized).toContain('Hi')
    expect(sanitized).toContain('color: hsl(172 55% 45%)')
    expect(sanitized).not.toContain('@font-face')
    expect(sanitized).not.toContain('example.com')
  })

  it('still rejects body-rule url() (e.g. background image XSS)', () => {
    // Defense-in-depth: after stripping @import/@font-face, a body-rule
    // url(javascript:...) must still drop the whole stylesheet.
    const sanitized = HTMLProcessor.sanitize(
      `<style>
        @import url('https://fonts.googleapis.com/css?family=Inter');
        .x { background: url(javascript:alert(1)); }
      </style>
      <div class="x">payload</div>`
    )

    expect(sanitized).toContain('payload')
    expect(sanitized).not.toContain('<style>')
    expect(sanitized).not.toContain('javascript:')
    expect(sanitized).not.toContain('url(')
  })

  it('preserves inline style="..." declarations that use CSS var() / hsl()', () => {
    // The valuation-iq template renders dozens of inline
    // style="background: hsl(var(--report-cream)); padding: var(--space-3)"
    // declarations. DOMPurify's default style-attr sanitiser has been known to
    // strip `var()` and `hsl()`. Lock in that the current config preserves both.
    const sanitized = HTMLProcessor.sanitize(
      `<style>.valuation-report { --report-cream: 40 20% 96%; --space-3: 12pt; }</style>
      <div class="valuation-report">
        <div style="background: hsl(var(--report-cream)); padding: var(--space-3); border-left: 3pt solid hsl(var(--report-teal));">
          <span style="font-size: 11px; color: hsl(var(--report-text-muted)); font-style: italic;">probe</span>
        </div>
      </div>`
    )

    expect(sanitized).toContain('probe')
    expect(sanitized).toContain('var(--report-cream)')
    expect(sanitized).toContain('var(--space-3)')
    expect(sanitized).toContain('var(--report-text-muted)')
    expect(sanitized).toContain('hsl(')
  })

  it('preserves page-header meta row structure (chip + ref on one row)', () => {
    const sanitized = HTMLProcessor.sanitize(
      `<style>
        .page-header-meta-row { display: flex; flex-wrap: nowrap; }
        .page-header-method { white-space: nowrap; }
      </style>
      <div class="page-header">
        <div class="page-header-meta">
          <div class="page-header-meta-row">
            <span class="page-header-method">Upswitch Adaptive · Marktbenadering</span>
            <p class="page-header-ref">VAL-2026-EEC8</p>
          </div>
          <p class="page-header-date">28 mei 2026</p>
        </div>
      </div>`
    )

    expect(sanitized).toContain('class="page-header-meta-row"')
    expect(sanitized).toContain('class="page-header-method"')
    expect(sanitized).toContain('class="page-header-ref"')
    expect(sanitized).toContain('Upswitch Adaptive · Marktbenadering')
    expect(sanitized).toContain('VAL-2026-EEC8')
    expect(sanitized).toContain('.page-header-meta-row { display: flex')
  })

  it('preserves the cover-page SVG logo (path/fill/d/viewBox)', () => {
    // The cover page embeds an Upswitch wordmark as inline SVG. DOMPurify must
    // keep <svg>/<path>/<g> + viewBox/fill/d attributes — the user's pasted
    // output shows the SVG survived, but pin it so a future DOMPurify upgrade
    // doesn't silently strip the logo.
    const sanitized = HTMLProcessor.sanitize(
      `<div class="cover-page">
        <svg viewBox="0 0 381 112" xmlns="http://www.w3.org/2000/svg">
          <path d="M348.084 35.9104V23.4579" fill="#F4F1EA"></path>
          <path d="M262.044 0.27809C261.546" fill="#C87F63"></path>
        </svg>
      </div>`
    )

    expect(sanitized).toContain('<svg')
    expect(sanitized).toContain('viewBox="0 0 381 112"')
    expect(sanitized).toContain('M348.084 35.9104')
    expect(sanitized).toContain('M262.044 0.27809')
    expect(sanitized).toContain('#F4F1EA')
    expect(sanitized).toContain('#C87F63')
  })

  it('still rejects stray @import that the surgical strip missed', () => {
    // Defense-in-depth: the unsafe-pattern check keeps /@import\b/ removed
    // (Mercury parity), so anything our regex misses falls through to other
    // tests rather than to a fail-closed reject. Verify a non-`;`-terminated
    // edge case still survives or is dropped predictably.
    const sanitized = HTMLProcessor.sanitize(
      `<style>@import url('https://fonts.googleapis.com/css')</style><div>ok</div>`
    )

    // The @import has no `;`, so our regex (semicolon optional) still strips it.
    // The remaining empty stylesheet means no <style> tag is re-injected.
    expect(sanitized).toContain('ok')
    expect(sanitized).not.toContain('@import')
    expect(sanitized).not.toContain('fonts.googleapis.com')
  })

  it('handles pre-2026-05-26 cached HTML that has no inner .valuation-report wrapper', () => {
    // Before the 2026-05-26 inner-wrapper fix in apps/valuation-iq/src/templates/main_report/base.html,
    // the rendered HTML carried .valuation-report ONLY on <body>. DOMPurify
    // strips <body>, so the class disappeared and `.valuation-report .cover-*`
    // selectors silently missed. The outer React wrapper (ManualReportWorkspace,
    // SafeReportHtml) adds a `<div className="valuation-report">` around the
    // dangerouslySetInnerHTML root, which heals these old cached rows.
    //
    // This sanitizer-level test confirms the strip behaves the same regardless
    // of inner-wrapper presence: the <style> block survives, the cover-page
    // content survives, and the surrounding React wrapper provides the scope.
    const html = `
      <style>
        @import url('https://fonts.googleapis.com/css?family=Inter');
        .valuation-report .cover-page { background: hsl(225 18% 8%); }
        .valuation-report .cover-company-name { color: #f4f1ea; }
      </style>
      <div class="cover-page">
        <h1 class="cover-company-name">Pre-fix Cached Row</h1>
      </div>`

    const sanitized = HTMLProcessor.sanitize(html)

    expect(sanitized).toContain('.cover-page')
    expect(sanitized).toContain('cover-company-name')
    expect(sanitized).toContain('Pre-fix Cached Row')
    // No inner .valuation-report div in the output — selector relies on the
    // React wrapper providing the ancestor `.valuation-report` scope.
    expect(sanitized).not.toContain('@import')
  })

  it('end-to-end: real template style block preserves the cover-page selectors', () => {
    // Mirror the literal opening of
    // apps/valuation-iq/src/templates/main_report/base.html, including the
    // exact `@import url('https://api.fontshare.com/...')` +
    // `@import url('https://fonts.googleapis.com/...')` pair that caused
    // the Three Towers Capital regression, plus every CSS variable + every
    // .cover-* selector observed in the user's broken render.
    const realStyleSlice = `
      @import url('https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700,900&display=swap');
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
      .valuation-report {
        --report-slate-950: 225 18% 8%;
        --report-teal: 172 55% 45%;
        --report-text: 225 18% 12%;
        --report-text-muted: 224 10% 45%;
        --report-cream: 40 20% 96%;
        --font-size-xxs: 6pt;
        --font-size-xs: 7pt;
        --font-size-sm: 8pt;
        --space-1: 4pt;
        --space-2: 8pt;
        --space-3: 12pt;
        --space-4: 16pt;
      }
      .valuation-report .cover-page { background: hsl(var(--report-slate-950)); display: flex; }
      .valuation-report .cover-bg-icon { position: absolute; top: 0; }
      .valuation-report .cover-hero-area { flex: 1; padding: var(--space-4); }
      .valuation-report .cover-company-name { color: #f4f1ea; font-size: 28pt; }
      .valuation-report .cover-value-amount { color: #c87f63; font-size: 36pt; }
    `
    const html = `<style>${realStyleSlice}</style>
      <div class="valuation-report"><div class="cover-page">
        <div class="cover-bg-icon"></div>
        <div class="cover-hero-area">
          <h1 class="cover-company-name">Creatief bureau</h1>
          <span class="cover-value-amount">€348K</span>
        </div>
      </div></div>`

    const sanitized = HTMLProcessor.sanitize(html)

    // Critical tokens — these were 0% present in the broken render
    for (const token of [
      '--report-slate-950',
      '--report-teal',
      '--report-cream',
      '--report-text-muted',
      '--space-1',
      '--space-3',
      '--font-size-sm',
    ]) {
      expect(sanitized, `token ${token} should survive`).toContain(token)
    }
    // Critical selectors
    for (const selector of [
      '.cover-page',
      '.cover-bg-icon',
      '.cover-hero-area',
      '.cover-company-name',
      '.cover-value-amount',
    ]) {
      expect(sanitized, `selector ${selector} should survive`).toContain(selector)
    }
    // Body content survives
    expect(sanitized).toContain('Creatief bureau')
    expect(sanitized).toContain('€348K')
    // Font CDNs gone
    expect(sanitized).not.toContain('@import')
    expect(sanitized).not.toContain('fontshare.com')
    expect(sanitized).not.toContain('fonts.googleapis.com')
  })
})
