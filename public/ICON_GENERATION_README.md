# Icon and favicon generation

## Source vectors (canonical)

- **`logos/upswitch-mark.svg`** — Terracotta capsule on a transparent canvas.
- **`logos/upswitch-app-icon.svg`** — Same capsule on a **black** tile (`#000000`). **Single source** for favicon PNGs, ICO, and PWA icons.

## Generation (shared implementation)

Shared library: **[`scripts/generate-favicons-lib.mjs`](../../../scripts/generate-favicons-lib.mjs)**. App entry: [`scripts/generate-favicons.mjs`](../scripts/generate-favicons.mjs). `pnpm run build` / `vercel-build` runs generation first.

From repo root:

```bash
node scripts/generate-favicons.mjs apps/venus
```

pnpm allows `sharp` native install via **`onlyBuiltDependencies`** in `package.json`.

## Optional: Puppeteer path

`public/generate-icons.js` can render PNGs via Puppeteer; production builds use **Sharp** + **to-ico** for `favicon.ico`.
