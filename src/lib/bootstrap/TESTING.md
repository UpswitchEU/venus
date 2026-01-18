# Bootstrap System Testing Guide

## Overview

The world-class bootstrap system resolves all initialization state (auth, session, prefill) in a single request before the UI renders. This eliminates race conditions and visual jumps.

## Test Scenarios

### 1. Guest User - New Report

**Steps:**
1. Open Venus in incognito: `https://valuation.upswitch.app/en/reports/new`
2. Observe loading state (should be brief, ~150ms)
3. Form should render with empty fields

**Expected:**
- Bootstrap resolves with `identity.type = 'guest'`
- New report ID is generated
- No prefill data (confidence = 0)
- Conversational flow may be suggested

**Console logs to verify:**
```
[BootstrapProvider] Bootstrap complete {
  identityType: 'guest',
  reportMode: 'new',
  prefillConfidence: '0.00',
  durationMs: ~150
}
```

---

### 2. Guest User - With KBO Prefill

**Steps:**
1. Open: `https://valuation.upswitch.app/en/reports/new?prefilledQuery=Upswitch`
2. Observe loading state
3. Check if company name is prefilled

**Expected:**
- Bootstrap includes KBO lookup
- `prefillData.sources` includes `'kbo'`
- Company name, KBO number, VAT, city, etc. are prefilled
- UI hint: `showKboVerification = true`

---

### 3. Authenticated User - New Report

**Steps:**
1. Log in to Venus
2. Navigate to `/en/reports/new`
3. Observe prefill behavior

**Expected:**
- `identity.type = 'authenticated'`
- `identity.userId` is set
- If user has profile data, `prefillData.sources` includes `'user_profile'`
- Form fields prefilled from profile

---

### 4. Authenticated User - Existing Report

**Steps:**
1. Log in and create a valuation
2. Note the report ID (e.g., `val_1737229123456_v1abc2def3`)
3. Navigate away, then return to that report URL
4. Observe restoration

**Expected:**
- `report.mode = 'existing'`
- `report.hasExistingData = true`
- Session data restored to form
- If valuation was completed, results are shown
- UI hint: `showWelcomeBack = true`

---

### 5. Accountant-for-Client Flow

**Steps:**
1. Log in as accountant in Mercury
2. Navigate to client's valuations page
3. Click "Create New Valuation"
4. Observe Venus opening with client context

**Expected:**
- URL includes `clientToken` parameter
- `identity.type = 'accountant_for_client'`
- `identity.clientContext` populated with client/accountant IDs
- Form prefilled with client's business card data
- UI hint: `showAccountantBanner = true`

---

### 6. Session Restoration (Manual Flow)

**Steps:**
1. Start a new valuation, fill some fields
2. Navigate away without completing
3. Return to the same report URL

**Expected:**
- Form data is restored from session
- Current step is preserved
- No data loss

---

### 7. Session Restoration (Conversational Flow)

**Steps:**
1. Start conversational valuation
2. Have a few exchanges with the AI
3. Navigate away
4. Return to the report

**Expected:**
- Chat history is restored
- Collected data is preserved
- Conversation can continue

---

### 8. Version Loading (M&A Workflow)

**Steps:**
1. Complete a valuation
2. Create a new version
3. Navigate to: `/en/reports/{id}?version=1`

**Expected:**
- Specific version is loaded
- Form shows version 1 data
- Can regenerate with changes

---

## Debug Tools

### Bootstrap Status Hook

Add to any component for debugging:

```tsx
import { useBootstrapStatus } from '@/hooks/useBootstrapStatus';

function MyComponent() {
  const status = useBootstrapStatus();
  console.log('Bootstrap status:', status);
  // ...
}
```

### Browser DevTools

1. Open Network tab
2. Filter by "bootstrap"
3. Observe single POST request to `/api/bootstrap`
4. Check response for complete state

### Console Logging

Bootstrap logs are prefixed with `[BootstrapProvider]` or `[Bootstrap]`.

---

## Performance Verification

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Bootstrap duration | < 200ms | Check `bootstrapDurationMs` in logs |
| Network requests | 1 | Network tab during page load |
| Time to interactive | < 500ms | Performance tab |
| Layout shifts | 0 | Lighthouse CLS score |

---

## Fallback Behavior

If Titan API fails, the system falls back to client-side resolution:

1. Auth check via cookie
2. Session load via SessionAPI
3. Profile fetch via UserAPI
4. KBO lookup via RegistryAPI

This is slower (~400-800ms) but still functional.

---

## Troubleshooting

### "Bootstrap failed" error

1. Check Titan API is running
2. Verify network connectivity
3. Check browser console for specific error
4. Fallback should still work

### Form not prefilled

1. Check `prefillData.confidence` in logs
2. Verify data exists in source (KBO, profile, session)
3. Check `fieldsPopulated` array

### Duplicate API calls

1. Ensure `useBootstrapSync` is called
2. Check `ValuationSessionManager` skips load when bootstrap has data
3. Verify no multiple BootstrapProvider instances

---

## Sign-Off Checklist

- [ ] Guest user new report works
- [ ] Guest user with KBO prefill works
- [ ] Authenticated user new report works
- [ ] Authenticated user existing report works
- [ ] Accountant-for-client flow works
- [ ] Manual flow restoration works
- [ ] Conversational flow restoration works
- [ ] Bootstrap duration < 200ms
- [ ] No visual layout shifts
- [ ] Fallback works when API fails
