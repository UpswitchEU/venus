# Venus Deployment Audit

**Context:** Last successful Vercel deployment was 4–5 hours ago (commit `d214a41`, build cache `DCWMF8WTP`). Build time: ~1m 20s. Subsequent deploys fail at "Deploying outputs" with "We encountered an internal error. Please try again."

**Scope:** Identify what could cause deployment failures and document the current state.

---

## 1. Current Build Status

| Check | Result |
|-------|--------|
| **Local build** | ✅ Succeeds (`pnpm run build`) |
| **TypeScript** | ✅ No errors |
| **Linting** | ✅ Passes |

---

## 2. Architecture Overview

| Aspect | Venus |
|--------|-------|
| **Next.js** | 13.5.6 |
| **Router** | App Router (`app/`) |
| **i18n** | next-intl (en, nl) |
| **Sentry** | ❌ Not used |
| **Instrumentation** | ❌ None |
| **Middleware** | next-intl (i18n routing, locale detection) |

---

## 3. Differences vs Mercury (Deployment Risk Profile)

Venus has a simpler setup than Mercury:

| Risk Factor | Mercury | Venus |
|-------------|---------|-------|
| Sentry | ✅ Used (conditional) | ❌ Not used |
| Edge instrumentation | Possible | ❌ None |
| `process.features` (Node-only) | In Sentry Edge | N/A |
| Prisma/OpenTelemetry | Via Sentry | N/A |
| `instrumentation.ts` | Yes | No |
| `opengraph-image` Edge | Yes | No |

Venus is less exposed to the Sentry/Edge issues that affected Mercury.

---

## 4. Potential Deployment Issues

### 4.1 Build Command & Package Manager

- **vercel.json:** `"buildCommand": "npm run build"`
- **package.json:** `"build": "next build"`
- **Lockfile:** `pnpm-lock.yaml` (pnpm)

Vercel will use pnpm when it detects `pnpm-lock.yaml`. The `buildCommand` still runs `npm run build`, which executes the `build` script. This is fine as long as dependencies are installed with pnpm and `next` is available.

**Recommendation:** Prefer `"buildCommand": "pnpm run build"` or `"pnpm build"` if you standardize on pnpm.

### 4.2 `outputFileTracingExcludes`

`next.config.js` uses `experimental.outputFileTracingExcludes` (Next.js 13 format) to keep serverless bundles smaller. This is appropriate for Vercel.

### 4.3 Middleware

- Uses `next-intl` for i18n.
- No auth/JWT in middleware (unlike Mercury).
- No Sentry or other third-party instrumentation.
- Removes `X-Frame-Options` for embedding from `upswitch.app`.

No obvious deployment risks here.

### 4.4 ManualInputPanel & ValuationFormData

- **ManualInputPanel** defines its own `ValuationFormData` with `revenue`, `ebitda`, `current_year_data`.
- **ManualLayout** `CollectedData` includes `revenue`, `ebitda`, `yearlyFinancials`, `current_year_data`.
- **onFormDataChange** passes `Record<string, unknown>` with these fields.
- Types line up; no TypeScript errors.

---

## 5. Vercel Configuration Checklist

1. **Environment variables**
   - `NEXT_PUBLIC_BASE_URL` (optional, defaults to `https://valuation.upswitch.app`)
   - Any API URLs or secrets used by Venus

2. **Build cache**
   - Last successful build: `DCWMF8WTP`
   - If deploys fail, try clearing the build cache and redeploying

3. **Output directory**
   - Do not override unless `distDir` is set in `next.config.js`

4. **Node version**
   - Align with local (e.g. 18 or 20) via `.nvmrc` or Vercel project settings

---

## 6. Fix Applied: outputFileTracingExcludes (expanded)

**Problem:** "Deploying outputs" failures are often caused by serverless functions exceeding Vercel's 250 MB uncompressed limit. File tracing can pull in unnecessary dev/build deps.

**Fix:** Expanded `experimental.outputFileTracingExcludes` in `next.config.js`:
- Platform-specific @swc binaries (darwin, win32) so only Linux deps are traced
- `@parcel/watcher`, `**/docs/**`
- **pnpm store patterns** for Venus (uses pnpm): `.pnpm/@swc+core-darwin*/**`, `.pnpm/@swc+core-win32*/**`, `.pnpm/@parcel+watcher*/**`, `.pnpm/esbuild*/**`
- **API route exclusions** (`/api/*`): typescript, @biomejs, @playwright, vitest, @vitest, @testing-library, jsdom

## 7. Recommended Next Steps

1. **Deploy with the fix**
   - Push the `next.config.js` changes and redeploy.
   - Clear Vercel build cache (Project Settings → General → Build Cache → Clear) before redeploying.

2. **If deploys still fail – diagnose**
   - Add env var `VERCEL_ANALYZE_BUILD_OUTPUT=1` in Vercel Project Settings.
   - Redeploy; build logs will show uncompressed function sizes (MB) and largest contributors.
   - If any function exceeds ~200 MB, add more exclusions or split the function.

3. **Optional improvements**
   - Add `instrumentation.ts` only if you introduce monitoring (e.g. Sentry).
   - If you add Sentry, reuse Mercury’s conditional setup and avoid Edge instrumentation.

---

## 8. Files Reviewed

- `package.json`
- `next.config.js`
- `vercel.json`
- `middleware.ts`
- `i18n.ts`
- `app/layout.tsx`
- `app/error.tsx`
- `src/components/calculator/ManualInputPanel.tsx`
- `src/features/manual/components/ManualLayout.tsx`
- `src/types/valuation.ts`
