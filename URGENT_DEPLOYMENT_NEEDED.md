# 🚨 URGENT: Venus Production Deployment Required

**Date:** 2026-01-14  
**Priority:** CRITICAL  
**Status:** Awaiting Deployment

---

## 🔴 Problem Summary

Production deployment of Venus (https://valuation.upswitch.app) is **severely outdated** and missing multiple critical fixes implemented in the codebase:

### Issues Visible in Production:
1. ❌ **Literal translation keys** displayed instead of translated text:
   - `report.toolbar.backToDashboard` → Should show "Terug naar Dashboard" (NL) or "Back to Dashboard" (EN)
   - `report.saveStatus.savedAgo` → Should show "X minuten geleden opgeslagen" (NL)
   - `forms.kboLookup.*` keys also affected

2. ❌ **Guest session handling bug** (403 Forbidden when authenticated users access the page)
   - Fix exists in: `apps/venus/src/store/useGuestSessionStore.ts`

3. ❌ **Incorrect API endpoint paths** (missing `/v2`)
   - Fix exists in: `apps/venus/src/services/reports/ReportService.ts`
   - Fix exists in: `apps/venus/src/services/session/SessionService.ts`

4. ❌ **Loading screen improvements** not deployed
   - Fix exists in: `apps/venus/app/[locale]/reports/[id]/LoadingState.tsx`

---

## ✅ Verification Complete

Translation files have been **confirmed correct** in the source code:

```bash
✅ Verified: apps/venus/messages/en.json
   - report.saveStatus.* (lines 441-447)
   - report.toolbar.* (lines 449-451)
   - forms.kboLookup.* (lines 359-381)

✅ Verified: apps/venus/messages/nl.json  
   - report.saveStatus.* (lines 440-446)
   - report.toolbar.* (lines 448-451)
   - forms.kboLookup.* (lines 359-381)
```

Run verification script:
```bash
cd apps/venus && node scripts/verify-translations.cjs
```

---

## 🚀 IMMEDIATE ACTION REQUIRED

### Option 1: Git-based Deployment (Recommended)

If Venus is set to auto-deploy from a Git branch:

```bash
# 1. Ensure all changes are committed
cd /Users/matthiasmandiau/Desktop/projects/current/upswitch
git status

# 2. Commit any outstanding changes (if needed)
git add apps/venus/messages/
git add apps/venus/src/
git commit -m "fix(venus): critical fixes - translations, guest sessions, API paths"

# 3. Push to trigger Vercel deployment
git push origin main  # Or whatever branch Vercel is watching
```

### Option 2: Vercel CLI Deployment

```bash
# Install Vercel CLI (if not installed)
npm install -g vercel

# Navigate to Venus
cd apps/venus

# Deploy to production
vercel --prod

# Or trigger a rebuild in Vercel dashboard
# Visit: https://vercel.com/your-org/venus/deployments
```

### Option 3: Vercel Dashboard (Manual)

1. Go to: https://vercel.com/your-org/venus
2. Navigate to "Deployments" tab
3. Find the latest successful deployment
4. Click "..." menu → "Redeploy"
5. Select "Use existing Build Cache: No" (force fresh build)
6. Click "Redeploy"

---

## 📋 Post-Deployment Verification Checklist

Once deployed, verify these URLs:

### 1. Check Translation Keys
- **URL:** https://valuation.upswitch.app/nl/reports/val_1768405166287_v9l1t0u2ts
- **Expected:** Dutch text like "Terug naar Dashboard", "Opgeslagen"
- **NOT:** Literal keys like `report.toolbar.backToDashboard`

### 2. Check Guest Session Handling
- **Test:** Access page while logged in as accountant
- **Expected:** No 403 errors in console
- **Check:** Browser DevTools → Console → Look for "User is authenticated, skipping guest session creation"

### 3. Check API Paths
- **Test:** Click "Calculate Valuation" button
- **Expected:** API calls to `/api/v2/billing/...` (with `/v2`)
- **Check:** Browser DevTools → Network tab → Filter by "billing"

### 4. Check Business Card Data Prefill
- **Test:** Create NEW valuation session from Mercury for a client
- **Flow:** Mercury → Client → Actions → "Create Valuation"
- **Expected:** Company name, country, business type should be pre-filled
- **Note:** Old sessions (like `val_1768405166287_v9l1t0u2ts`) may not have this data

---

## 🔧 Files Changed (For Reference)

### Translations
- ✅ `apps/venus/messages/en.json` (lines 440-453)
- ✅ `apps/venus/messages/nl.json` (lines 439-452)

### Guest Session Fix
- ✅ `apps/venus/src/store/useGuestSessionStore.ts` (added auth check)

### API Path Fixes
- ✅ `apps/venus/src/services/reports/ReportService.ts` (added `/v2`)
- ✅ `apps/venus/src/services/session/SessionService.ts` (added `/v2`)

### Loading Screen
- ✅ `apps/venus/app/[locale]/reports/[id]/LoadingState.tsx` (multi-state)

---

## 📊 Expected Impact

### Before Deployment:
- ❌ Literal translation keys in UI
- ❌ 403 errors for authenticated users
- ❌ 404 errors on billing endpoints
- ❌ Basic loading screen

### After Deployment:
- ✅ Proper Dutch/English translations
- ✅ Authenticated users work correctly
- ✅ Correct API endpoint calls
- ✅ Enhanced multi-state loading screen

---

## ⏰ Estimated Deployment Time

- **Vercel Auto-Deploy:** 5-10 minutes (after git push)
- **Vercel Manual Redeploy:** 3-5 minutes
- **Propagation Time:** 1-2 minutes

**Total:** ~10-15 minutes from deployment to live

---

## 🆘 If Issues Persist After Deployment

1. **Clear browser cache:**
   ```
   Chrome: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
   ```

2. **Check Vercel deployment logs:**
   - Look for build errors
   - Verify `messages/` directory is included in build

3. **Verify environment variables:**
   - `NEXT_PUBLIC_BACKEND_URL` should be `https://api.upswitch.app`
   - `NEXT_PUBLIC_API_BASE_URL` should be `https://api.upswitch.app`

4. **Check Vercel build output:**
   - Ensure `messages/en.json` and `messages/nl.json` are in `.next` directory
   - Run locally: `cd apps/venus && npm run build` to verify

---

## 📝 Additional Notes

### Old Session Data
The current test session (`val_1768405166287_v9l1t0u2ts`) appears to be an old session that:
- Was created before the Mercury prefill feature
- Does not have business card data in `session_data`
- Will **NOT** show prefilled data (this is expected)

**To test business card prefill:**
1. Go to Mercury dashboard
2. Select a client with complete business info
3. Click "Create Valuation" or similar action
4. Verify the NEW session has prefilled data

### Backend Status
The following backend fixes are **already deployed**:
- ✅ Session creation bug (passing `userId` and `guestSessionId`)
- ✅ Pro plan enforcement (accountant user has Pro plan in DB)
- ✅ Guest sessions `fingerprint` column (migration provided, pending DB execution)

---

**Status:** 🔴 AWAITING VENUS PRODUCTION DEPLOYMENT

Once deployed, all translation and authentication issues should be resolved.
