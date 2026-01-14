# 🚨 URGENT: Production Deployment Needed

**Date**: 2026-01-14  
**Status**: ⚠️ Critical fixes not deployed to production  
**URL Affected**: https://valuation.upswitch.app/nl/reports/val_1768414329217_v2ojd6tlmq

## Current Production Issues

### 1. ❌ Missing Translations (Literal Keys Showing)
Production is showing literal translation keys instead of translated text:
- `report.toolbar.backToDashboard` ❌
- `report.saveStatus.savedAgo` ❌  
- `forms.kboLookup.verifiedCompany` ❌
- `forms.kboLookup.registration` ❌
- `forms.kboLookup.type` ❌
- `forms.kboLookup.address` ❌
- `forms.kboLookup.kboBelgium` ❌
- `forms.kboLookup.changeCompany` ❌
- `forms.kboLookup.active` ❌

### 2. ❌ 403 Forbidden - Guest Session Creation
**Error**: `Failed to create guest session (403 Forbidden)`  
**Root Cause**: Authenticated users are trying to create guest sessions  
**Fix Status**: ✅ Fixed in code (`apps/venus/src/store/useGuestSessionStore.ts`)  
**Deployed**: ❌ NO

### 3. ❌ 404 Not Found - Plan Enforcement API
**Error**: `GET /api/billing/plan-enforcement/check?usage_type=VALUATION` returns 404  
**Root Cause**: Missing `/v2` in API path  
**Fix Status**: ✅ Fixed in code:
  - `apps/venus/src/services/reports/ReportService.ts`
  - `apps/venus/src/services/session/SessionService.ts`  
**Deployed**: ❌ NO

## ✅ Fixes Already Implemented (Not Deployed)

### Frontend Fixes (Venus)
1. **Translation Files** - `apps/venus/messages/en.json` & `nl.json`
   - ✅ Added `report.toolbar.*` keys
   - ✅ Added `report.saveStatus.*` keys
   - ✅ Added `forms.kboLookup.*` keys

2. **Guest Session Store** - `apps/venus/src/store/useGuestSessionStore.ts`
   - ✅ Prevents authenticated users from creating guest sessions
   - ✅ Checks `isAuthenticated` before calling backend

3. **API Path Corrections** - `ReportService.ts` & `SessionService.ts`
   - ✅ Changed `/api/billing/...` to `/api/v2/billing/...`
   - ✅ Added graceful degradation for 404 errors

### Backend Fixes (Titan) - Already Deployed
1. ✅ Session service user context fix
2. ✅ Pro plan enforcement logic
3. ✅ Guest session fingerprint column migration (SQL ready to run)

## 📋 Deployment Checklist

### Step 1: Verify Source Code
```bash
# Check translation files have the keys
cat apps/venus/messages/en.json | grep -A 20 '"report":'
cat apps/venus/messages/nl.json | grep -A 20 '"report":'

# Check guest session fix
cat apps/venus/src/store/useGuestSessionStore.ts | grep -A 5 'isAuthenticated'

# Check API path fixes
grep -n "api/v2/billing" apps/venus/src/services/reports/ReportService.ts
grep -n "api/v2/billing" apps/venus/src/services/session/SessionService.ts
```

### Step 2: Deploy Venus to Vercel
**Option A: Vercel CLI**
```bash
cd /Users/matthiasmandiau/Desktop/projects/current/upswitch/apps/venus
vercel --prod
```

**Option B: Git Push (if using GitHub integration)**
```bash
cd /Users/matthiasmandiau/Desktop/projects/current/upswitch
git add apps/venus/messages/en.json
git add apps/venus/messages/nl.json
git add apps/venus/src/store/useGuestSessionStore.ts
git add apps/venus/src/services/reports/ReportService.ts
git add apps/venus/src/services/session/SessionService.ts
git commit -m "fix: add missing translations and fix guest session/API paths"
git push origin main  # or your branch name
```

**Option C: Vercel Dashboard**
1. Go to https://vercel.com/dashboard
2. Find the Venus project
3. Go to Deployments
4. Click "Redeploy" on the latest deployment

### Step 3: Apply Backend Database Migration
```bash
cd /Users/matthiasmandiau/Desktop/projects/current/upswitch/apps/titan-api
./scripts/fix-guest-sessions-schema.sh
```

### Step 4: Verify Production
After deployment (wait 2-3 minutes for build):
```bash
# Check translations
curl -I https://valuation.upswitch.app/nl/reports/val_1768414329217_v2ojd6tlmq

# Check in browser - these should show Dutch text, not keys:
# - "Terug naar Dashboard" (not "report.toolbar.backToDashboard")
# - "Geverifieerd Bedrijf" (not "forms.kboLookup.verifiedCompany")
# - "Opgeslagen" (not "report.saveStatus.saved")
```

### Step 5: Clear Browser Cache
```bash
# In browser DevTools Console:
localStorage.clear();
sessionStorage.clear();
location.reload(true);
```

## Expected Results After Deployment

### Before (Current Production)
```html
<button>report.toolbar.backToDashboard</button>
<span>forms.kboLookup.verifiedCompany</span>
<div>report.saveStatus.savedAgo</div>
```

### After (Successful Deployment)
```html
<button>Terug naar Dashboard</button>
<span>Geverifieerd Bedrijf</span>
<div>Opgeslagen 5 minuten geleden</div>
```

### Console Errors Should Disappear
- ❌ `Failed to create guest session (403)` → ✅ No error (skips for authenticated users)
- ❌ `GET /api/billing/plan-enforcement/check 404` → ✅ `GET /api/v2/billing/plan-enforcement/check 200`

## Troubleshooting

### If translations still don't show:
1. Check build logs in Vercel dashboard for errors
2. Verify `i18n.ts` configuration: `locales: ['en', 'nl']`
3. Verify middleware is routing correctly
4. Clear Vercel's build cache and redeploy

### If 403 errors persist:
1. Check browser console for `isAuthenticated` state
2. Verify user is logged in (check cookies/tokens)
3. Check if `useAuthStore` is working correctly

### If 404 errors persist:
1. Verify Titan API is running with `/v2` routes
2. Check `NEXT_PUBLIC_BACKEND_URL` environment variable in Vercel
3. Verify API endpoint exists: `curl https://api.upswitch.app/api/v2/billing/plan-enforcement/check?usage_type=VALUATION`

## Timeline Estimate
- **Vercel Deployment**: 3-5 minutes (build time)
- **Cache Propagation**: 1-2 minutes (CDN)
- **Total**: ~5-7 minutes from deploy to live

## Contact Info
If deployment fails, check:
- Vercel dashboard: https://vercel.com/dashboard
- Build logs for errors
- Environment variables are set correctly

---

**Action Required**: Deploy Venus frontend to Vercel NOW to fix production issues.
