# Mercury → Venus Integration Diagnostics

## Issues Identified

### Issue 1: 403 Forbidden on Valuation Calculate
**Error**: `api.upswitch.app/api/v2/valuations/calculate:1 Failed to load resource: the server responded with a status of 403 ()`

**Root Cause Analysis**:
The valuation calculate endpoint is rejecting the request, likely because:
1. Client context headers not being sent
2. Authentication token missing/invalid
3. Accountant doesn't have permission to create valuations for this client

**Debug Steps**:
```javascript
// Check client context in browser console
useClientContext.getState()

// Check auth state
useAuthStore.getState().user

// Check headers being sent
// Open Network tab, find the /api/v2/valuations/calculate request
// Check Request Headers for:
// - X-Client-Context-User
// - X-Client-Context-Accountant
// - X-Client-Context-Relationship
// - Cookie (authentication)
```

### Issue 2: Form Fields Not Pre-filling
**Symptom**: Basic information fields (Company Name, Business Type, Founding Year, Country) are empty despite business card data being available.

**Root Cause Analysis**:
Session restoration logic not detecting business card data or restoration not triggering.

**Debug Steps**:
```javascript
// Check session data
useSessionStore.getState().session?.sessionData

// Check form data
useManualFormStore.getState().formData

// Check restoration status
// Look for logs: "[ManualLayout] Restoring form fields from sessionData"
```

### Issue 3: 429 Too Many Requests on Session Save
**Error**: Multiple 429 errors on `PATCH /api/v2/valuations/sessions/val_*`

**Root Cause**: Session auto-save is triggering too frequently, hitting rate limits.

---

## Immediate Fixes Needed

### Fix 1: Ensure Client Context is Set on Page Load

**Problem**: When coming from Mercury with `clientToken`, the client context needs to be properly initialized before any API calls.

**Location**: `apps/venus/src/lib/auth.ts`

The auth initialization should:
1. Exchange clientToken FIRST (lines 540-664 already do this)
2. Wait for context to be set before allowing API calls
3. Verify context is persisted to localStorage

**Verification**:
```typescript
// After page load, check:
const context = useClientContext.getState()
console.log('Is acting as client?', context.isActingAsClient)
console.log('Accountant:', context.accountant)
console.log('Client:', context.client)
console.log('Relationship ID:', context.relationshipId)
```

### Fix 2: Add Loading Guard for Valuation Calculate

**Problem**: Valuation calculate might be called before client context is fully initialized.

**Solution**: Add a loading guard that prevents form submission until client context is ready.

**Location**: `apps/venus/src/features/manual/components/ManualLayout.tsx`

```typescript
// Before allowing form submission:
const clientContext = useClientContext()

if (clientContext.isActingAsClient) {
  // Verify context is valid
  const headers = clientContext.getContextHeaders()
  if (Object.keys(headers).length === 0) {
    showToast('Please wait, initializing...', 'warning')
    return
  }
}
```

### Fix 3: Debug Logging for Client Context Headers

**Problem**: No visibility into whether headers are actually being sent.

**Solution**: Add explicit logging in ValuationAPI when making calculate request.

**Location**: `apps/venus/src/services/api/valuation/ValuationAPI.ts`

```typescript
async calculateManualValuation(data, options) {
  // Add debug log
  const { useClientContext } = await import('../../../stores/clientContext')
  const contextHeaders = useClientContext.getState().getContextHeaders()
  
  console.log('[ValuationAPI] Calculate request headers:', {
    hasClientContext: Object.keys(contextHeaders).length > 0,
    headers: contextHeaders,
  })
  
  // ... rest of method
}
```

### Fix 4: Verify Session Data Contains Business Card Fields

**Problem**: Session might not contain the business card data from Mercury.

**Solution**: Add explicit logging when session loads to verify data presence.

**Location**: `apps/venus/src/services/session/SessionService.ts`

Already has logging, but verify it's showing:
```typescript
hasFormFields: hasSessionData && (
  sessionData.company_name ||
  sessionData.business_type_id ||
  sessionData.founding_year ||
  sessionData.country_code
)
```

---

## Testing Checklist

### Test 1: Client Context Initialization
1. Open Mercury as accountant
2. Create/select client
3. Click "Start Valuation"
4. Open browser console in Venus
5. Run: `useClientContext.getState()`
6. **Expected**: `isActingAsClient: true`, all fields populated

### Test 2: Headers in API Requests
1. Follow Test 1 steps
2. Open Network tab
3. Attempt to calculate valuation
4. Find `/api/v2/valuations/calculate` request
5. Check Request Headers
6. **Expected**: See `X-Client-Context-User`, `X-Client-Context-Accountant`, `X-Client-Context-Relationship`

### Test 3: Form Prefilling
1. Follow Test 1 steps
2. Observe form fields on load
3. **Expected**: Company Name, Business Type, Founding Year, Country pre-filled
4. Check console for: `[ManualLayout] Restoring form fields from sessionData`

### Test 4: Valuation Calculation Success
1. Follow Test 1-3 steps
2. Fill in Revenue and EBITDA
3. Click "Calculate Valuation"
4. **Expected**: No 403 error, valuation completes successfully

---

## API Endpoint Verification

### Titan API Requirements for `/api/v2/valuations/calculate`

**Required Headers** (when acting as accountant for client):
```
X-Client-Context-User: <client_user_id>
X-Client-Context-Accountant: <accountant_user_id>
X-Client-Context-Relationship: <relationship_id>
Cookie: <authentication_cookie>
```

**Backend Logic** (in Titan):
1. Validate accountant is authenticated (check cookie)
2. Validate relationship exists between accountant and client
3. Create valuation report owned by CLIENT
4. Attribute `created_by_pro_user_id` to ACCOUNTANT
5. Return valuation result

**Common Failure Modes**:
- 401: No authentication cookie → User not logged in
- 403: Invalid relationship → Accountant doesn't have access to this client
- 403: Missing client context headers → Server can't identify client
- 429: Rate limit exceeded → Too many requests in short time

---

## Quick Browser Console Debug

Run these commands in browser console when on Venus page:

```javascript
// 1. Check client context
const ctx = useClientContext.getState()
console.log('Client Context:', {
  isActing: ctx.isActingAsClient,
  accountant: ctx.accountant?.id,
  client: ctx.client?.id,
  relationship: ctx.relationshipId,
  headers: ctx.getContextHeaders()
})

// 2. Check auth state
const auth = useAuthStore.getState()
console.log('Auth State:', {
  user: auth.user?.id,
  loading: auth.loading
})

// 3. Check session data
const session = useSessionStore.getState().session
console.log('Session Data:', {
  reportId: session?.reportId,
  hasSessionData: !!session?.sessionData,
  sessionDataKeys: session?.sessionData ? Object.keys(session.sessionData) : [],
  companyName: session?.sessionData?.company_name,
  businessTypeId: session?.sessionData?.business_type_id
})

// 4. Check form data
const form = useManualFormStore.getState().formData
console.log('Form Data:', {
  companyName: form.company_name,
  businessTypeId: form.business_type_id,
  foundingYear: form.founding_year,
  countryCode: form.country_code
})
```

---

## Likely Root Cause

Based on the errors, the most likely issue is:

**Accountant authentication state is not properly established when coming from Mercury.**

The flow should be:
1. Mercury generates `clientToken` JWT containing:
   - Accountant user ID
   - Client user ID  
   - Relationship ID
2. Mercury opens Venus: `https://venus.upswitch.app/reports/val_xxx?clientToken=<jwt>&return_url=<mercury_url>`
3. Venus `initializeAuth()` runs (in `lib/auth.ts`)
4. Venus exchanges `clientToken` via `POST /api/v2/auth/exchange-client-context`
5. Titan validates JWT, creates session for accountant, returns context
6. Venus sets `useClientContext` state
7. Venus HttpClient interceptor adds headers to all requests

**If any step fails, the 403 will occur.**

The 429 errors suggest the page is reloading/re-initializing multiple times, which might indicate:
- Infinite redirect loop
- Auth initialization failing and retrying
- Session save triggering too frequently

---

## Recommended Fix Order

1. **Add loading guard**: Prevent form submission until context is ready
2. **Add debug logging**: Verify headers are being sent
3. **Check Titan logs**: See why 403 is returned (missing headers? invalid relationship?)
4. **Fix session save rate limiting**: Debounce auto-save more aggressively
5. **Verify session restoration**: Ensure business card data is present and restoration triggers

---

## Long-term Improvements

1. **Loading States**: Show "Initializing..." while client context is being set up
2. **Error Recovery**: If context fails to load, show error with "Return to Mercury" button
3. **Context Validation**: Periodically re-validate context (current TTL: 24 hours)
4. **Rate Limiting**: Implement client-side rate limiting for session saves
5. **Telemetry**: Track context initialization success/failure rates
