# Venus Deployment Checklist - Session Loading Fix

## Changes Made

### 1. Service Worker Version Bump ✅
- **File**: `apps/venus/public/sw.js`
- **Change**: Version `1.0.6` → `1.0.7`
- **Impact**: Forces all clients to invalidate cached API responses and download fresh code

### 2. API Endpoint Updates ✅
Updated all API endpoints from old structure to new v2 structure:

#### SessionAPI.ts
- ✅ GET `/api/valuation-sessions/:id` → `/api/v2/valuations/sessions/:id`
- ✅ PATCH `/api/valuation-sessions/:id` → `/api/v2/valuations/sessions/:id`
- ✅ POST `/api/valuation-sessions/:id/switch-view` → `/api/v2/valuations/sessions/:id/switch-view`
- ✅ PUT `/api/valuation-sessions/:id/result` → `/api/v2/valuations/sessions/:id/result`

#### VersionAPI.ts
- ✅ All 7 version endpoints updated to use `/api/v2/valuations/sessions/...`

### 3. Backend Verification ✅
Confirmed backend is running and accessible:
- ✅ Health endpoint: `https://api.upswitch.app/health` → 200 OK
- ✅ Sessions list: `https://api.upswitch.app/api/v2/valuations/sessions` → 200 OK
- ✅ Auth endpoint: `https://api.upswitch.app/api/v2/auth/me` → 401 (expected)

## Vercel Environment Variables

**CRITICAL**: Verify these are set in Vercel dashboard before deploying:

```bash
NEXT_PUBLIC_BACKEND_URL=https://api.upswitch.app
NEXT_PUBLIC_API_BASE_URL=https://api.upswitch.app
NEXT_PUBLIC_VALUATION_ENGINE_URL=https://api.valuations.upswitch.app
NEXT_PUBLIC_VALUATION_API_URL=https://api.valuations.upswitch.app
```

### How to Verify in Vercel:
1. Go to https://vercel.com/dashboard
2. Select the Venus project (`valuation.upswitch.app`)
3. Go to Settings → Environment Variables
4. Confirm the above variables are set for **Production** environment
5. If any are missing or incorrect, update them and trigger a new deployment

## Deployment Steps

### Step 1: Commit Changes
```bash
cd /Users/matthiasmandiau/Desktop/projects/current/upswitch/apps/venus
git add public/sw.js
git add src/services/api/session/SessionAPI.ts
git add src/services/api/version/VersionAPI.ts
git commit -m "fix: Update API endpoints to v2 and bump service worker version

- Bump service worker from v1.0.6 to v1.0.7 to force cache invalidation
- Update all /api/valuation-sessions endpoints to /api/v2/valuations/sessions
- Fix SessionAPI: GET, PATCH, POST switch-view, PUT result endpoints
- Fix VersionAPI: All 7 version management endpoints
- Resolves net::ERR_FAILED errors by ensuring correct backend URL usage"
```

### Step 2: Push to Repository
```bash
git push origin <current-branch>
```

### Step 3: Deploy to Vercel
If Vercel is connected to your Git repository, it will auto-deploy on push.

**OR** manually trigger deployment:
1. Go to Vercel dashboard
2. Select Venus project
3. Click "Deployments" tab
4. Click "Redeploy" on the latest deployment
5. Check "Use existing Build Cache" is **UNCHECKED** (important!)
6. Click "Redeploy"

### Step 4: Wait for Deployment
- Monitor deployment progress in Vercel dashboard
- Wait for "Ready" status
- Deployment URL: https://valuation.upswitch.app

## Post-Deployment Testing

### Test 1: Fresh Browser (Incognito)
1. Open **new incognito window** (Cmd+Shift+N on Mac, Ctrl+Shift+N on Windows)
2. Navigate to: https://valuation.upswitch.app/reports/val_1768147287340_voztp0qim?flow=manual&prefilledQuery=E-commerce+store&autoSend=true
3. Open DevTools → Network tab
4. **Verify**:
   - ✅ Requests go to `api.upswitch.app` (not `web-production-8d00b.up.railway.app`)
   - ✅ Endpoint is `/api/v2/valuations/sessions/...` (not old structure)
   - ✅ No `net::ERR_FAILED` errors
   - ✅ Service worker shows version `1.0.7` in console

### Test 2: Existing Browser (Clear Cache)
1. Open DevTools → Application tab
2. Click "Clear storage" → "Clear site data"
3. In Service Workers section, click "Unregister" on old service worker
4. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
5. Repeat Test 1 verification steps

### Test 3: Create New Session
1. Go to https://valuation.upswitch.app
2. Click "Start New Valuation"
3. Fill in company details
4. **Verify**:
   - ✅ Session saves successfully
   - ✅ Network tab shows correct API endpoints
   - ✅ No console errors

## Expected Results

### ✅ Success Indicators
- Service worker console log shows: `[ServiceWorker] Version 1.0.7 initializing`
- All API requests go to `api.upswitch.app`
- All API requests use `/api/v2/valuations/sessions/...` pattern
- Sessions load without errors
- Reports display correctly

### ❌ Failure Indicators (Troubleshoot)
- Still seeing `web-production-8d00b.up.railway.app` in Network tab
  - **Solution**: Clear browser cache completely, unregister service worker
- Still seeing `/api/valuation-sessions` (without v2)
  - **Solution**: Verify deployment picked up latest code
- Getting 404 errors on API calls
  - **Solution**: Check Vercel environment variables are correct

## Rollback Plan (If Needed)

If deployment causes issues:

1. **Revert in Vercel**:
   - Go to Vercel dashboard → Deployments
   - Find previous working deployment
   - Click "..." → "Promote to Production"

2. **Revert code changes**:
   ```bash
   git revert HEAD
   git push origin <current-branch>
   ```

## Support & Monitoring

### Check Logs
- **Vercel Logs**: Vercel dashboard → Deployments → Click deployment → View Function Logs
- **Browser Console**: DevTools → Console tab (look for service worker logs)
- **Network Errors**: DevTools → Network tab (filter by "Fetch/XHR")

### Common Issues

#### Issue: Service Worker Not Updating
**Solution**:
1. DevTools → Application → Service Workers
2. Check "Update on reload"
3. Click "Unregister"
4. Hard refresh (Cmd+Shift+R)

#### Issue: Environment Variables Not Applied
**Solution**:
1. Verify in Vercel dashboard
2. Trigger **new** deployment (not redeploy)
3. Ensure "Use existing Build Cache" is unchecked

#### Issue: CORS Errors
**Solution**:
1. Verify backend CORS includes `https://valuation.upswitch.app`
2. Check backend logs for CORS preflight failures
3. Backend CORS config is in `apps/titan-api/src/main.ts` line 391

## Summary

This fix addresses the root cause of session loading failures:
1. **Stale service worker cache** - Fixed by version bump
2. **Old API endpoint structure** - Fixed by updating all endpoints to v2
3. **Incorrect backend URL** - Fixed by ensuring environment variables are correct

After deployment, users will automatically receive the updated service worker and fresh code on their next visit.
