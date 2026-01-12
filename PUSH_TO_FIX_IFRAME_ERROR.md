# 🚨 CRITICAL FIX: Venus Iframe Error

## Problem
Venus shows "Server Components render" error **ONLY when loaded in iframe from Mercury**, but works perfectly when accessed directly at `valuation.upswitch.app`.

## Root Cause
The `next-intl.config.ts` file was calling `notFound()` when an invalid locale was detected during SSR. Here's the sequence:

1. Mercury opens: `https://valuation.upswitch.app/reports/xyz?embedded=true` (no locale prefix)
2. Middleware redirects to: `/en/reports/xyz?embedded=true`
3. During SSR, `next-intl.config.ts` is invoked
4. It sees the initial request had no locale and calls `notFound()`
5. `notFound()` throws an error during SSR → "Server Components render" error

## Fix Applied
✅ Replaced `notFound()` with graceful fallback to default locale (`en`) in:
- `i18n.ts`
- `next-intl.config.ts`
- `app/[locale]/layout.tsx` (removed unused import)

## 📋 TO FIX THE ERROR, YOU MUST:

### 1. Push the Commit
```bash
# Open GitHub Desktop
# You should see commit: "fix: Replace notFound() with graceful fallback in i18n config..."
# Push to origin/main
```

### 2. Wait for Vercel Deployment
- Vercel will auto-deploy (takes ~2-3 minutes)
- Check deployment status at: https://vercel.com/upswitch/venus

### 3. Test in Mercury
- Open Mercury: `https://upswitch.app/nl/accountant/clients/[clientId]`
- Click "Start New Valuation" to open the modal
- The iframe should now load without the "Server Components render" error

## What Changed
```diff
// next-intl.config.ts (BEFORE)
export default getRequestConfig(async ({ locale }) => {
  if (!locale || !locales.includes(locale as Locale)) {
-   notFound(); // ❌ Causes SSR error in iframe context
  }
});

// next-intl.config.ts (AFTER)
export default getRequestConfig(async ({ locale }) => {
  if (!locale || !locales.includes(locale as Locale)) {
+   console.warn(`Invalid locale: ${locale}, falling back to ${defaultLocale}`);
+   locale = defaultLocale; // ✅ Graceful fallback
  }
});
```

## Verification
After deployment, you should see:
- ✅ Venus loads in iframe without errors
- ✅ Venus still works when accessed directly
- ✅ Console shows warning for invalid locales (instead of crashing)

---

**Status**: Ready to push (commit `73c558f`)
