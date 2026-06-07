# Security Headers Threat Model

Venus is the valuation/calculator surface embedded by Upswitch-owned shells.
Its framing policy is intentionally different from Mercury: cross-subdomain
embedding is product-required, but only from Upswitch-controlled origins.

## Framing

Venus uses CSP `frame-ancestors 'self' https://upswitch.app https://*.upswitch.app`.
It must not emit `X-Frame-Options`, because `SAMEORIGIN` blocks the intended
Mercury-to-Venus cross-subdomain embed and `ALLOW-FROM` is obsolete.
The app still emits the shared hardening headers around that product exception:
`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` and
CSP `object-src 'none'`.

Middleware also strips platform-injected `X-Frame-Options` so the CSP
`frame-ancestors` policy remains the single source of truth. When middleware
sees an existing CSP, it appends `frame-ancestors` instead of replacing the
policy, so directives such as `default-src`, `script-src`, `base-uri`, and
`form-action` remain intact.

`vercel.json` must not emit a partial `Content-Security-Policy`; the full policy
lives in `next.config.js` so the platform layer cannot accidentally replace the
non-framing directives with a frame-only CSP.

## Script Execution

Production CSP must not include `'unsafe-eval'`. Development builds may keep it
for framework tooling, but production code should run without string-evaluated
JavaScript.

`'unsafe-inline'` remains a temporary compatibility allowance. The next CSP
hardening step is nonce/hash migration for first-party inline scripts and a
vendor-by-vendor review of the remaining browser integrations.

## Guardrail

`pnpm run guard:security-headers` imports the production Next config and fails
if Venus reintroduces production `'unsafe-eval'`, loses the Upswitch
`frame-ancestors` allowlist, loses CSP `object-src 'none'`, weakens HSTS,
emits a partial CSP from `vercel.json`, emits `X-Frame-Options`, or stops
stripping platform-injected frame headers in middleware. It also fails if
middleware stops appending `frame-ancestors` to an existing CSP and risks
replacing the rest of the security policy.
