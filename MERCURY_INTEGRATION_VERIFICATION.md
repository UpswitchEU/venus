# Mercury-Venus Locale Integration Verification

## 🎯 Objective

Verify that language preferences persist seamlessly between Mercury (main app) and Venus (valuation app) for a unified user experience.

---

## 🏗️ Integration Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    User Journey                          │
│                                                          │
│  Mercury (EN) → Venus (EN) → Back to Mercury (EN)       │
│      │             │              │                      │
│      └─────────────┴──────────────┘                      │
│           Shared NEXT_LOCALE Cookie                      │
└──────────────────────────────────────────────────────────┘
```

### Shared Configuration

| Component | Mercury | Venus | Status |
|-----------|---------|-------|--------|
| Locales | `['en', 'nl']` | `['en', 'nl']` | ✅ Matching |
| Default | `'en'` | `'en'` | ✅ Matching |
| Cookie Name | `NEXT_LOCALE` | `NEXT_LOCALE` | ✅ Matching |
| Cookie Path | `/` | `/` | ✅ Matching |
| Cookie Max-Age | 31536000 (1 year) | 31536000 (1 year) | ✅ Matching |
| Cookie SameSite | `Lax` | `Lax` | ✅ Matching |
| API Endpoint | `/api/user/language` | `/api/user/language` | ✅ Matching |

---

## ✅ Test Scenarios

### Scenario 1: Mercury EN → Venus EN

**Steps:**
1. [ ] Open Mercury in English: `https://app.upswitch.com/en/dashboard`
2. [ ] Verify Mercury displays in English
3. [ ] Click "Get Free Valuation" or valuation link
4. [ ] Venus opens in new tab
5. [ ] **Verify:**
   - [ ] Venus URL starts with `/en`
   - [ ] Venus displays in English
   - [ ] Cookie `NEXT_LOCALE=en` is present
   - [ ] No language mismatch flash

**Expected Result:** ✅ Venus opens in English

---

### Scenario 2: Mercury NL → Venus NL

**Steps:**
1. [ ] Open Mercury in Dutch: `https://app.upswitch.com/nl/dashboard`
2. [ ] Verify Mercury displays in Dutch
3. [ ] Click "Gratis Waardering" or valuation link
4. [ ] Venus opens in new tab
5. [ ] **Verify:**
   - [ ] Venus URL starts with `/nl`
   - [ ] Venus displays in Dutch
   - [ ] Cookie `NEXT_LOCALE=nl` is present
   - [ ] No language mismatch flash

**Expected Result:** ✅ Venus opens in Dutch

---

### Scenario 3: Change Language in Mercury → Venus Follows

**Steps:**
1. [ ] Open Mercury in English
2. [ ] Switch language to Dutch using language selector
3. [ ] **Verify:** Mercury changes to Dutch
4. [ ] Click valuation link
5. [ ] **Verify:**
   - [ ] Venus opens in Dutch
   - [ ] URL is `/nl/*`
   - [ ] Cookie updated to `NEXT_LOCALE=nl`

**Expected Result:** ✅ Venus respects Mercury's language change

---

### Scenario 4: Change Language in Venus → Mercury Follows

**Steps:**
1. [ ] Open Venus in English
2. [ ] Switch language to Dutch using language selector
3. [ ] **Verify:** Venus changes to Dutch
4. [ ] Return to Mercury (close Venus tab or click "Return to Mercury")
5. [ ] **Verify:**
   - [ ] Mercury displays in Dutch
   - [ ] URL is `/nl/*`
   - [ ] Cookie is `NEXT_LOCALE=nl`

**Expected Result:** ✅ Mercury respects Venus's language change

---

### Scenario 5: Direct Link with Locale

**Steps:**
1. [ ] Open Mercury in English
2. [ ] Copy valuation link: `https://valuation.upswitch.app/en/home`
3. [ ] Share link with colleague
4. [ ] Colleague opens link (new browser session)
5. [ ] **Verify:**
   - [ ] Venus opens in English (from URL)
   - [ ] Cookie `NEXT_LOCALE=en` is set
   - [ ] If they switch to Dutch, cookie updates

**Expected Result:** ✅ Direct links preserve locale from URL

---

### Scenario 6: Authenticated User Preference

**Steps:**
1. [ ] Login to Mercury as authenticated user
2. [ ] Switch language to Dutch
3. [ ] **Verify:** API call to `/api/user/language` with `{ language: 'nl' }`
4. [ ] Logout
5. [ ] Login again
6. [ ] **Verify:**
   - [ ] Mercury opens in Dutch (preference loaded)
   - [ ] Click valuation link
   - [ ] Venus opens in Dutch

**Expected Result:** ✅ User preference persists across sessions

---

### Scenario 7: Guest User (No Persistence)

**Steps:**
1. [ ] Open Mercury in incognito/private mode (guest)
2. [ ] Switch language to Dutch
3. [ ] **Verify:** Mercury changes to Dutch
4. [ ] **Verify:** No API call to `/api/user/language`
5. [ ] Open Venus (new tab)
6. [ ] **Verify:** Venus opens in Dutch (from cookie)
7. [ ] Close all tabs
8. [ ] Open Mercury again (new session)
9. [ ] **Verify:** Opens in English (default, no persistence)

**Expected Result:** ✅ Guest changes are session-only

---

### Scenario 8: Browser Refresh Persistence

**Steps:**
1. [ ] Open Mercury in Dutch
2. [ ] Open Venus (opens in Dutch)
3. [ ] Refresh Venus (F5)
4. [ ] **Verify:** Venus still in Dutch
5. [ ] Refresh Mercury (F5)
6. [ ] **Verify:** Mercury still in Dutch

**Expected Result:** ✅ Locale persists across refreshes

---

### Scenario 9: Multiple Tabs Consistency

**Steps:**
1. [ ] Open Mercury in Tab 1 (English)
2. [ ] Open Venus in Tab 2 (English)
3. [ ] Switch Mercury to Dutch in Tab 1
4. [ ] Switch to Tab 2 (Venus)
5. [ ] Refresh Tab 2
6. [ ] **Verify:** Venus now displays in Dutch

**Expected Result:** ✅ Locale changes sync across tabs via cookie

---

### Scenario 10: Cross-Domain Cookie Handling

**Steps:**
1. [ ] Open Mercury: `https://app.upswitch.com/en`
2. [ ] Open DevTools → Application → Cookies
3. [ ] **Verify:** Cookie `NEXT_LOCALE=en` exists for `app.upswitch.com`
4. [ ] Open Venus: `https://valuation.upswitch.app/en`
5. [ ] Open DevTools → Application → Cookies
6. [ ] **Verify:** Cookie `NEXT_LOCALE=en` exists for `valuation.upswitch.app`
7. [ ] Change language in Venus to Dutch
8. [ ] **Verify:** Cookie updates to `NEXT_LOCALE=nl` for `valuation.upswitch.app`
9. [ ] Return to Mercury
10. [ ] **Verify:** Cookie is `NEXT_LOCALE=nl` for `app.upswitch.com`

**Expected Result:** ✅ Cookies are domain-specific but sync via shared storage

---

## 🔧 API Integration Testing

### POST /api/user/language

**Request:**
```json
{
  "language": "nl"
}
```

**Expected Response:**
```json
{
  "success": true,
  "language": "nl"
}
```

**Verification Steps:**

1. [ ] Open Mercury, login as authenticated user
2. [ ] Switch language to Dutch
3. [ ] Open DevTools → Network tab
4. [ ] **Verify:** API call to `/api/user/language`
5. [ ] **Verify:** Request body: `{ "language": "nl" }`
6. [ ] **Verify:** Response status: `200 OK`
7. [ ] Repeat in Venus
8. [ ] **Verify:** Same API endpoint called
9. [ ] **Verify:** Same request/response format

**Expected Result:** ✅ Both apps use identical API contract

---

## 🧪 Edge Cases

### Edge Case 1: Invalid Locale in URL

**Steps:**
1. [ ] Navigate to `https://valuation.upswitch.app/fr/home` (invalid locale)
2. [ ] **Verify:** Redirects to `/en/home` (default)
3. [ ] **Verify:** No errors in console

**Expected Result:** ✅ Graceful fallback to default locale

---

### Edge Case 2: Missing Cookie

**Steps:**
1. [ ] Open Venus in incognito mode
2. [ ] Delete `NEXT_LOCALE` cookie via DevTools
3. [ ] Refresh page
4. [ ] **Verify:** Falls back to `/en` (default)
5. [ ] **Verify:** Cookie is re-created

**Expected Result:** ✅ Handles missing cookie gracefully

---

### Edge Case 3: Corrupted Cookie

**Steps:**
1. [ ] Open Venus
2. [ ] Manually set cookie: `NEXT_LOCALE=invalid`
3. [ ] Refresh page
4. [ ] **Verify:** Redirects to `/en` (default)
5. [ ] **Verify:** Cookie is corrected

**Expected Result:** ✅ Handles invalid cookie value

---

### Edge Case 4: Simultaneous Language Change

**Steps:**
1. [ ] Open Mercury in Tab 1
2. [ ] Open Venus in Tab 2
3. [ ] Switch Mercury to Dutch in Tab 1
4. [ ] Immediately switch Venus to French in Tab 2 (if possible)
5. [ ] **Verify:** Last-write-wins (Venus change takes precedence)
6. [ ] Refresh Tab 1
7. [ ] **Verify:** Mercury reflects Venus's change

**Expected Result:** ✅ Last-write-wins, no conflicts

---

## 📊 Performance Testing

### Page Load Time with Locale

**Metric:** Time to interactive (TTI)

1. [ ] Measure Mercury load time (English): _______ ms
2. [ ] Measure Mercury load time (Dutch): _______ ms
3. [ ] Measure Venus load time (English): _______ ms
4. [ ] Measure Venus load time (Dutch): _______ ms
5. [ ] **Verify:** No significant difference (< 100ms variance)

**Expected Result:** ✅ Locale does not impact performance

---

### Cookie Read/Write Latency

**Metric:** Time from language change to cookie update

1. [ ] Switch language in Mercury
2. [ ] Measure time to cookie update: _______ ms
3. [ ] Switch language in Venus
4. [ ] Measure time to cookie update: _______ ms
5. [ ] **Target:** < 50ms

**Expected Result:** ✅ Cookie updates are instant

---

## 🔍 Security Verification

### Cookie Security Attributes

1. [ ] Open DevTools → Application → Cookies
2. [ ] Inspect `NEXT_LOCALE` cookie
3. [ ] **Verify:**
   - [ ] `SameSite=Lax` (CSRF protection)
   - [ ] `Secure=false` (localhost) or `Secure=true` (production)
   - [ ] `HttpOnly=false` (accessible to JavaScript)
   - [ ] `Path=/` (available across all routes)
   - [ ] `Max-Age=31536000` (1 year)

**Expected Result:** ✅ Cookie is secure and properly configured

---

### API Authentication

1. [ ] Open Mercury as guest
2. [ ] Switch language
3. [ ] **Verify:** No API call (guest mode)
4. [ ] Login as authenticated user
5. [ ] Switch language
6. [ ] **Verify:** API call includes authentication token

**Expected Result:** ✅ API only called for authenticated users

---

## 📝 Debugging Checklist

If locale sync fails between Mercury and Venus:

1. [ ] Check cookie name matches: `NEXT_LOCALE`
2. [ ] Check cookie domain: Should be app-specific, not shared root domain
3. [ ] Check cookie path: Should be `/`
4. [ ] Check cookie max-age: Should be 31536000 (1 year)
5. [ ] Check browser console for errors
6. [ ] Verify both apps use same locale values: `['en', 'nl']`
7. [ ] Check API endpoint: `/api/user/language`
8. [ ] Verify middleware is running (locale detection)
9. [ ] Check if service worker is interfering
10. [ ] Clear all cookies and retry

---

## ✅ Final Sign-Off

### Mercury-Venus Integration Status

- [ ] All test scenarios passed
- [ ] Edge cases handled gracefully
- [ ] Performance targets met
- [ ] Security verification completed
- [ ] No cookie conflicts
- [ ] API integration working
- [ ] Cross-domain sync functional
- [ ] User preferences persist correctly

### Sign-Off

- **Tester Name:** ___________________________
- **Date:** ___________________________
- **Mercury Version:** ___________________________
- **Venus Version:** ___________________________
- **Status:** [ ] APPROVED [ ] NEEDS FIXES

---

## 🐛 Known Issues

Document any issues found during testing:

| Issue | Severity | Impact | Workaround | Status |
|-------|----------|--------|------------|--------|
| _Example: Cookie delay on Safari_ | Low | _5-10ms delay_ | _None needed_ | _Open_ |
|  |  |  |  |  |

---

**Last Updated**: January 13, 2026  
**Version**: 1.0.0  
**Maintained by**: QA Team
