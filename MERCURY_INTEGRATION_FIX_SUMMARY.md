# Mercury → Venus Integration Fix Summary

## Issues Addressed

### Issue 1: 403 Forbidden on Valuation Calculate ⚠️
**Error**: `Failed to load resource: the server responded with a status of 403 ()`

**Diagnosis**: Client context headers may not be attached to valuation calculate requests.

**Fix Applied**:
Added comprehensive debug logging to `ValuationAPI.ts` to track:
- Whether client context is set (`isActingAsClient`)
- Whether headers are being generated (`getContextHeaders()`)
- Whether user is authenticated
- Actual header values being sent

**Location**: `apps/venus/src/services/api/valuation/ValuationAPI.ts`
- Lines 27-54: Added logging to `calculateManualValuation()`
- Lines 111-148: Added logging to `calculateValuationUnified()`

**What to Look For**:
When you try to calculate a valuation, check the browser console for:
```
[ValuationAPI] Calculate unified valuation - Context check
```

This log will show:
- `isActingAsClient`: Should be `true` when coming from Mercury
- `hasClientContext`: Should be `true` if headers are present
- `hasAuth`: Should be `true` if accountant is authenticated
- `accountantId`, `clientId`, `relationshipId`: Should have values
- `headers`: Actual header object being sent

**Expected Output (Working)**:
```javascript
{
  isActingAsClient: true,
  hasClientContext: true,
  hasAuth: true,
  accountantId: "abc12345...",
  clientId: "xyz67890...",
  relationshipId: "rel12345...",
  headers: {
    "X-Client-Context-User": "xyz67890-full-uuid",
    "X-Client-Context-Accountant": "abc12345-full-uuid",
    "X-Client-Context-Relationship": "rel12345-full-uuid"
  }
}
```

**Actual Problem (if headers are empty)**:
```javascript
{
  isActingAsClient: false,  // ❌ Should be true
  hasClientContext: false,  // ❌ Should be true
  hasAuth: false,          // ❌ Should be true
  headers: {}              // ❌ Should have 3 headers
}
```

### Issue 2: Form Fields Not Pre-filling 🔍
**Symptom**: Company Name, Business Type, Founding Year, Country fields are empty.

**Diagnosis**: Session restoration may not be detecting business card data or not triggering.

**Verification Steps**:
1. Open browser console
2. Run: `useSessionStore.getState().session?.sessionData`
3. Check if business card fields are present:
   - `company_name`
   - `business_type_id`
   - `founding_year`
   - `country_code`

**If Data Is Present But Form Is Empty**:
- Check console for: `[ManualLayout] Restoring form fields from sessionData`
- If missing, restoration isn't triggering
- Check: `useManualFormStore.getState().formData`

**If Data Is Not Present**:
- Mercury isn't sending business card data to Titan
- Check Mercury's session creation code

### Issue 3: 429 Rate Limiting on Session Save 🚨
**Error**: Multiple `429 Too Many Requests` on session PATCH

**Root Cause**: Auto-save triggering too frequently, hitting Titan's rate limits.

**Temporary Workaround**: Wait 5-10 seconds between form changes before submitting.

**Long-term Fix Needed**: Implement more aggressive debouncing on session auto-save (currently may be saving on every keystroke).

---

## Testing Instructions

### Test 1: Verify Client Context Headers
1. **Setup**: In Mercury, create/select a client, click "Start Valuation"
2. **In Venus**: Open browser console (F12)
3. **Run**:
```javascript
const ctx = useClientContext.getState()
console.log('Client Context:', {
  isActing: ctx.isActingAsClient,
  hasHeaders: Object.keys(ctx.getContextHeaders()).length > 0,
  accountant: ctx.accountant?.id,
  client: ctx.client?.id,
  relationship: ctx.relationshipId
})
```
4. **Expected**: All fields should have values
5. **If not**: Client context initialization failed

### Test 2: Verify Session Data
1. **In Venus**: Open browser console
2. **Run**:
```javascript
const session = useSessionStore.getState().session
console.log('Session Data:', {
  reportId: session?.reportId,
  companyName: session?.sessionData?.company_name,
  businessTypeId: session?.sessionData?.business_type_id,
  foundingYear: session?.sessionData?.founding_year,
  countryCode: session?.sessionData?.country_code
})
```
3. **Expected**: Business card fields should have values
4. **If not**: Mercury isn't passing business card data

### Test 3: Attempt Valuation Calculate
1. **Fill in**: Revenue and EBITDA (minimum required fields)
2. **Click**: "Calculate Valuation" button
3. **Watch console** for:
   - `[ValuationAPI] Calculate unified valuation - Context check`
   - Check if `hasClientContext: true`
4. **Watch Network tab** for `/api/v2/valuations/calculate` request
5. **Check Request Headers** for:
   - `X-Client-Context-User`
   - `X-Client-Context-Accountant`
   - `X-Client-Context-Relationship`
6. **Result**:
   - ✅ If headers present but still 403: Permission issue in Titan
   - ❌ If headers missing: HttpClient interceptor not running

---

## Root Cause Hypotheses

### Hypothesis 1: Token Exchange Failing
**Symptom**: `isActingAsClient: false`, no client context set

**Cause**: Venus's `clientToken` exchange is failing silently

**Check**: Look for console errors during page load:
```
[Auth] Exchange failed
[ClientContext] Invalid context structure
```

**Fix**: Mercury needs to ensure `clientToken` is valid JWT

### Hypothesis 2: HttpClient Interceptor Not Running
**Symptom**: Client context set but headers not in request

**Cause**: ValuationAPI might be using wrong axios instance

**Check**: Verify `ValuationAPI extends HttpClient`

**Already Verified**: ✅ ValuationAPI does extend HttpClient

### Hypothesis 3: Race Condition
**Symptom**: Headers sometimes present, sometimes not

**Cause**: Valuation triggered before client context fully initialized

**Fix**: Add loading guard (see next section)

---

## Recommended Immediate Actions

### Action 1: Add Loading Guard
**File**: `apps/venus/src/features/manual/components/ManualLayout.tsx`

Before allowing form submission, check:
```typescript
const clientContext = useClientContext()

// If accountant is acting for client, verify context is ready
if (clientContext.isActingAsClient) {
  const headers = clientContext.getContextHeaders()
  if (Object.keys(headers).length === 0) {
    showToast('Initializing client context, please wait...', 'warning')
    return // Prevent submission
  }
}
```

### Action 2: Add Initialization Loading State
Show a loading spinner until:
1. Client context is set (if `clientToken` present)
2. Session data is loaded
3. Form restoration is complete

### Action 3: Improve Error Messages
When 403 occurs, check if it's due to missing client context:
```typescript
if (error.response?.status === 403) {
  const ctx = useClientContext.getState()
  if (ctx.isActingAsClient && !Object.keys(ctx.getContextHeaders()).length) {
    throw new Error('Client context not initialized. Please return to Mercury and try again.')
  }
}
```

---

## Next Steps

1. **Deploy these changes** to staging/production
2. **Test from Mercury** → Venus flow
3. **Check console logs** for the new debug output
4. **Report findings**:
   - Are client context headers being sent?
   - Is session data present?
   - What's the actual 403 error response from Titan?

5. **Based on findings**:
   - If headers missing: Fix HttpClient or token exchange
   - If headers present: Fix Titan authorization logic
   - If data missing: Fix Mercury session creation

---

## Files Modified

1. ✅ `apps/venus/src/services/api/valuation/ValuationAPI.ts`
   - Added debug logging to track client context headers
   - Added logging to both `calculateManualValuation()` and `calculateValuationUnified()`

---

## Expected Log Output

### Successful Flow
```
[ValuationAPI] Calculate unified valuation - Context check {
  isActingAsClient: true,
  hasClientContext: true,
  hasAuth: true,
  accountantId: "abc12345...",
  clientId: "xyz67890...",
  relationshipId: "rel12345...",
  headers: {
    X-Client-Context-User: "xyz...",
    X-Client-Context-Accountant: "abc...",
    X-Client-Context-Relationship: "rel..."
  }
}
[ValuationService] Valuation calculated successfully
```

### Failed Flow (Missing Context)
```
[ValuationAPI] Calculate unified valuation - Context check {
  isActingAsClient: false,
  hasClientContext: false,
  hasAuth: false,
  headers: {}
}
[ValuationAPI] CRITICAL: Client context enabled but headers are EMPTY!
[api] API request failed with status 403
```

---

## Contact for Support

If issues persist after these changes:

1. **Provide**: Full browser console output (copy all logs)
2. **Provide**: Network tab HAR file or screenshot of failing request
3. **Provide**: Output of debug commands from "Test 1" and "Test 2"

This will help identify whether the issue is:
- Frontend (Venus): Context not set, headers not sent
- Backend (Titan): Authorization logic rejecting valid requests
- Integration (Mercury): Token generation or business card data passing

---

**Status**: 🔍 Diagnostic Logging Added  
**Next**: Test and Report Findings
