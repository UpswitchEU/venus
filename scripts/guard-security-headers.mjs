#!/usr/bin/env node

import fs from 'node:fs'

process.env.NODE_ENV = 'production'

const { default: nextConfig } = await import(
  `${new URL('../next.config.js', import.meta.url).href}?guard=${Date.now()}`
)

const headerRules = await nextConfig.headers()
const headers = headerRules.flatMap((rule) => rule.headers ?? [])
const csp = headers.find((header) => header.key === 'Content-Security-Policy')?.value ?? ''
const xFrameOptions = headers.find((header) => header.key === 'X-Frame-Options')?.value
const middlewareSource = fs.readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8')
const securityHeadersDoc = fs.readFileSync(
  new URL('../docs/architecture/security-headers.md', import.meta.url),
  'utf8',
)
const vercelConfig = JSON.parse(
  fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
)
const failures = []

function directiveValue(policy, directiveName) {
  const directive = policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${directiveName} `))
  return directive ?? ''
}

const scriptSrc = directiveValue(csp, 'script-src')
const styleSrc = directiveValue(csp, 'style-src')
const objectSrc = directiveValue(csp, 'object-src')
const hsts =
  headers.find((header) => header.key === 'Strict-Transport-Security')?.value ?? ''
const vercelCspHeader = (vercelConfig.headers ?? [])
  .flatMap((rule) => rule.headers ?? [])
  .find((header) => header.key === 'Content-Security-Policy')

if (!csp) {
  failures.push('Content-Security-Policy header is missing')
}

if (csp.includes("'unsafe-eval'")) {
  failures.push("production CSP must not allow 'unsafe-eval'")
}

if (scriptSrc.includes("'unsafe-inline'") || styleSrc.includes("'unsafe-inline'")) {
  const documentedInlineException =
    securityHeadersDoc.includes("'unsafe-inline'") &&
    /temporary/i.test(securityHeadersDoc) &&
    /nonce/i.test(securityHeadersDoc) &&
    /hash/i.test(securityHeadersDoc)

  if (!documentedInlineException) {
    failures.push(
      "production 'unsafe-inline' CSP allowances must be documented as temporary with a nonce/hash migration plan",
    )
  }
}

if (!/frame-ancestors[^;]*https:\/\/\*\.upswitch\.app/.test(csp)) {
  failures.push('Venus CSP must explicitly allow cross-subdomain Upswitch embedding')
}

if (objectSrc !== "object-src 'none'") {
  failures.push("Venus CSP must block plugins with object-src 'none'")
}

if (hsts !== 'max-age=63072000; includeSubDomains; preload') {
  failures.push('Venus HSTS must use max-age=63072000; includeSubDomains; preload')
}

if (vercelCspHeader) {
  failures.push('Venus vercel.json must not emit a partial CSP; keep CSP in next.config.js')
}

if (xFrameOptions) {
  failures.push('Venus must not emit X-Frame-Options from next.config.js; use CSP frame-ancestors')
}

if (!middlewareSource.includes("headers.delete('X-Frame-Options')")) {
  failures.push('Venus middleware must strip platform-injected X-Frame-Options')
}

if (!middlewareSource.includes('existingCSP ? `${existingCSP}; ${VENUS_FRAME_ANCESTORS}`')) {
  failures.push('Venus middleware must append frame-ancestors without replacing existing CSP directives')
}

if (failures.length > 0) {
  console.error('[security-headers] guard failed')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(
  "[security-headers] production CSP excludes 'unsafe-eval', embedding uses frame-ancestors, and inline CSP exceptions are documented.",
)
