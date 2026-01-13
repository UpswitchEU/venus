# Translation Testing Checklist - Venus

## ✅ Pre-Testing Setup

- [ ] Run `npm run i18n:check` - Verify 100% translation coverage
- [ ] Start development server: `npm run dev`
- [ ] Clear browser cache and cookies
- [ ] Test in both Chrome and Firefox (minimum)

---

## 🌐 Language Selector Testing

### English → Dutch

1. [ ] Navigate to `http://localhost:3001/en`
2. [ ] Click language selector
3. [ ] Select "Nederlands"
4. [ ] **Verify:**
   - [ ] URL changes to `/nl`
   - [ ] All visible text changes to Dutch
   - [ ] Cookie `NEXT_LOCALE=nl` is set
   - [ ] No page reload (smooth transition)
   - [ ] Language selector shows "Nederlands" as selected

### Dutch → English

1. [ ] From Dutch locale `/nl`
2. [ ] Click language selector
3. [ ] Select "English"
4. [ ] **Verify:**
   - [ ] URL changes to `/en`
   - [ ] All visible text changes to English
   - [ ] Cookie `NEXT_LOCALE=en` is set
   - [ ] No page reload
   - [ ] Language selector shows "English" as selected

---

## 🧭 Navigation & Toolbar Testing

### Toolbar Actions (EN)
- [ ] "New Valuation" button shows English text
- [ ] "Download PDF" tooltip shows English
- [ ] "Refresh" tooltip shows English
- [ ] "Fullscreen" tooltip shows English
- [ ] Save status shows "Saving...", "Saved", "Auto-saving..." in English

### Toolbar Actions (NL)
- [ ] "Nieuwe Waardering" button shows Dutch text
- [ ] "PDF Downloaden" tooltip shows Dutch
- [ ] "Vernieuwen" tooltip shows Dutch
- [ ] "Volledig scherm" tooltip shows Dutch
- [ ] Save status shows "Opslaan...", "Opgeslagen", "Automatisch opslaan..." in Dutch

### Tabs (Both Locales)
- [ ] "Preview" / "Voorbeeld" tab
- [ ] "Info" / "Info" tab
- [ ] "History" / "Geschiedenis" tab
- [ ] Active tab is highlighted
- [ ] Inactive tabs are clickable

### Flow Switcher (Both Locales)
- [ ] "Manual Entry" / "Handmatige Invoer" tooltip
- [ ] "AI Assistant" / "AI Assistent" tooltip
- [ ] Icons show correctly
- [ ] Active flow is highlighted

---

## 📝 Form Testing

### Basic Information Section (EN)

- [ ] Section header: "Basic Information"
- [ ] Field labels:
  - [ ] "Business Type"
  - [ ] "Company Name"
  - [ ] "Founding Year"
  - [ ] "Country"
- [ ] Placeholder text in English
- [ ] Search placeholder: "Search for your business type..."
- [ ] Help text displays in English

### Basic Information Section (NL)

- [ ] Section header: "Basisinformatie"
- [ ] Field labels:
  - [ ] "Bedrijfstype"
  - [ ] "Bedrijfsnaam"
  - [ ] "Oprichtingsjaar"
  - [ ] "Land"
- [ ] Placeholder text in Dutch
- [ ] Search placeholder: "Zoek naar uw bedrijfstype..."
- [ ] Help text displays in Dutch

### Financial Data Section (EN)

- [ ] Section header: "Financial Data"
- [ ] Field labels:
  - [ ] "Annual Revenue"
  - [ ] "EBITDA"
  - [ ] "Employee Count"
- [ ] Placeholder text in English

### Financial Data Section (NL)

- [ ] Section header: "Financiële Gegevens"
- [ ] Field labels:
  - [ ] "Jaaromzet"
  - [ ] "EBITDA"
  - [ ] "Aantal Werknemers"
- [ ] Placeholder text in Dutch

### Submit Button (EN)

- [ ] Default: "Calculate Valuation"
- [ ] With normalization: "Calculate with Normalization"
- [ ] Regeneration mode: "Regenerate Report"
- [ ] Submitting state: "Calculating..."

### Submit Button (NL)

- [ ] Default: "Waardering Berekenen"
- [ ] With normalization: "Berekenen met Normalisatie"
- [ ] Regeneration mode: "Rapport Opnieuw Genereren"
- [ ] Submitting state: "Berekenen..."

---

## ⚠️ Form Validation Testing

### Required Field Validation (EN)

1. [ ] Leave "Annual Revenue" empty
2. [ ] Try to submit form
3. [ ] **Verify error:** "Revenue is required"

4. [ ] Leave "EBITDA" empty
5. [ ] Try to submit
6. [ ] **Verify error:** "EBITDA is required"

### Required Field Validation (NL)

1. [ ] Switch to Dutch locale
2. [ ] Leave "Jaaromzet" empty
3. [ ] Try to submit
4. [ ] **Verify error:** "Omzet is verplicht"

5. [ ] Leave "EBITDA" empty
6. [ ] Try to submit
7. [ ] **Verify error:** "EBITDA is verplicht"

### Number Validation (EN)

1. [ ] Enter negative revenue: `-1000`
2. [ ] **Verify error:** "Revenue must be a positive number"

### Number Validation (NL)

1. [ ] Switch to Dutch
2. [ ] Enter negative revenue: `-1000`
3. [ ] **Verify error:** "Omzet moet een positief getal zijn"

---

## 💬 Conversational Flow Testing

### Welcome Message (EN)

- [ ] Opens to: "Hi! I'm your valuation assistant..."
- [ ] Input placeholder: "Type your message here..."
- [ ] Suggestion chips in English:
  - [ ] "Your business type"
  - [ ] "Your revenue"
  - [ ] "Number of employees"

### Welcome Message (NL)

- [ ] Opens to: "Hallo! Ik ben uw waarderingsassistent..."
- [ ] Input placeholder: "Typ hier uw bericht..."
- [ ] Suggestion chips in Dutch:
  - [ ] "Uw bedrijfstype"
  - [ ] "Uw omzet"
  - [ ] "Aantal werknemers"

### Chat Actions (Both Locales)

- [ ] "Send" / "Verzenden" button
- [ ] "Regenerate" / "Opnieuw genereren" button
- [ ] "Start Over" / "Opnieuw beginnen" button

### Status Messages (EN)

- [ ] "Thinking..."
- [ ] "Typing..."
- [ ] "Analyzing your business..."
- [ ] "Calculating value..."

### Status Messages (NL)

- [ ] "Nadenken..."
- [ ] "Typen..."
- [ ] "Uw bedrijf analyseren..."
- [ ] "Waarde berekenen..."

---

## 📊 Reports & Results Testing

### Report Sections (EN)

- [ ] "Executive Summary"
- [ ] "Company Overview"
- [ ] "Financial Analysis"
- [ ] "Valuation Analysis"
- [ ] "Recommendations"

### Report Sections (NL)

- [ ] "Managementsamenvatting"
- [ ] "Bedrijfsoverzicht"
- [ ] "Financiële Analyse"
- [ ] "Waarderingsanalyse"
- [ ] "Aanbevelingen"

### Report Actions (EN)

- [ ] "Download PDF"
- [ ] "Share Report"
- [ ] "View Version"
- [ ] "Compare Versions"

### Report Actions (NL)

- [ ] "PDF Downloaden"
- [ ] "Rapport Delen"
- [ ] "Versie Bekijken"
- [ ] "Versies Vergelijken"

---

## 🔢 Number & Currency Formatting

### English Locale

- [ ] Revenue €1,000,000 displays as: "€1,000,000.00"
- [ ] Large number 1234567.89 displays as: "1,234,567.89"
- [ ] Decimal separator is "."
- [ ] Thousands separator is ","

### Dutch Locale

- [ ] Revenue €1,000,000 displays as: "€ 1.000.000,00"
- [ ] Large number 1234567.89 displays as: "1.234.567,89"
- [ ] Decimal separator is ","
- [ ] Thousands separator is "."

### Date Formatting

**English:**
- [ ] Short date: "1/13/2026" (MM/DD/YYYY)
- [ ] Long date: "January 13, 2026"

**Dutch:**
- [ ] Short date: "13-1-2026" (DD-MM-YYYY)
- [ ] Long date: "13 januari 2026"

---

## 🔔 Notifications & Toasts

### Success Messages (EN)

- [ ] Save success: "Saved successfully"
- [ ] Upload success: "Uploaded successfully"
- [ ] Export success: "Exported successfully"

### Success Messages (NL)

- [ ] Save success: "Succesvol opgeslagen"
- [ ] Upload success: "Succesvol geüpload"
- [ ] Export success: "Succesvol geëxporteerd"

### Error Messages (EN)

- [ ] Generic error: "Something went wrong"
- [ ] Network error: "Connection Error"
- [ ] Validation error: "Validation Error"
- [ ] Calculation error: "Calculation Error"

### Error Messages (NL)

- [ ] Generic error: "Er is iets misgegaan"
- [ ] Network error: "Verbindingsfout"
- [ ] Validation error: "Validatiefout"
- [ ] Calculation error: "Berekeningsfout"

---

## 🪟 Modal Dialogs

### Flow Switch Modal (EN)

- [ ] Title: "Switch Flow Mode"
- [ ] Description includes: "Switching between Manual and AI modes..."
- [ ] Buttons: "Switch Mode" and "Stay in Current Mode"

### Flow Switch Modal (NL)

- [ ] Title: "Flow Modus Wisselen"
- [ ] Description includes: "Het wisselen tussen Handmatige en AI modi..."
- [ ] Buttons: "Modus Wisselen" and "In Huidige Modus Blijven"

### Delete Confirmation (EN)

- [ ] Title: "Confirm Deletion"
- [ ] Description: "Are you sure you want to delete this?"
- [ ] Warning: "This action cannot be undone."
- [ ] Buttons: "Delete" and "Cancel"

### Delete Confirmation (NL)

- [ ] Title: "Verwijdering Bevestigen"
- [ ] Description: "Weet u zeker dat u dit wilt verwijderen?"
- [ ] Warning: "Deze actie kan niet ongedaan worden gemaakt."
- [ ] Buttons: "Verwijderen" and "Annuleren"

---

## 🔄 Version History

### Version List (EN)

- [ ] Header: "Version History"
- [ ] Current version label: "Current Version"
- [ ] Previous versions: "Previous Versions"
- [ ] Version format: "Version 1", "V1"
- [ ] Created date: "Created on {date}"

### Version List (NL)

- [ ] Header: "Versiegeschiedenis"
- [ ] Current version label: "Huidige Versie"
- [ ] Previous versions: "Vorige Versies"
- [ ] Version format: "Versie 1", "V1"
- [ ] Created date: "Gemaakt op {date}"

### Version Actions (EN)

- [ ] "View Version"
- [ ] "Restore"
- [ ] "Compare"
- [ ] "Download"

### Version Actions (NL)

- [ ] "Versie Bekijken"
- [ ] "Herstellen"
- [ ] "Vergelijken"
- [ ] "Downloaden"

---

## 🔍 Empty States

### No Data (EN)

- [ ] "No data available"
- [ ] "No results found"
- [ ] "No reports available"
- [ ] "Start by creating your first..."

### No Data (NL)

- [ ] "Geen gegevens beschikbaar"
- [ ] "Geen resultaten gevonden"
- [ ] "Geen rapporten beschikbaar"
- [ ] "Begin met het maken van uw eerste..."

---

## ⏳ Loading States

### English

- [ ] "Loading..."
- [ ] "Initializing..."
- [ ] "Loading application..."
- [ ] "Please wait..."
- [ ] "Almost there..."

### Dutch

- [ ] "Laden..."
- [ ] "Initialiseren..."
- [ ] "Applicatie laden..."
- [ ] "Een moment geduld..."
- [ ] "Bijna klaar..."

---

## 🌍 Locale Persistence

### Browser Refresh

1. [ ] Set locale to Dutch
2. [ ] Refresh browser (F5)
3. [ ] **Verify:** Still in Dutch locale
4. [ ] Check cookie: `NEXT_LOCALE=nl` exists

### Cross-Tab Consistency

1. [ ] Open Venus in Tab 1 (English)
2. [ ] Switch to Dutch in Tab 1
3. [ ] Open Venus in Tab 2 (new tab)
4. [ ] **Verify:** Tab 2 opens in Dutch

### Direct URL Navigation

1. [ ] Navigate directly to `/nl/dashboard`
2. [ ] **Verify:** Page loads in Dutch
3. [ ] Navigate directly to `/en/dashboard`
4. [ ] **Verify:** Page loads in English

---

## 🔐 Authenticated User Testing

### Language Preference Sync

1. [ ] Login as authenticated user
2. [ ] Switch language to Dutch
3. [ ] **Verify:** API call to `/api/user/language` with `{ language: 'nl' }`
4. [ ] Logout and login again
5. [ ] **Verify:** Opens in Dutch (preference persisted)

### Guest User

1. [ ] Open in incognito/private mode
2. [ ] Switch language to Dutch
3. [ ] **Verify:** Language changes to Dutch
4. [ ] **Verify:** No API call to `/api/user/language` (guest mode)
5. [ ] Close and reopen browser
6. [ ] **Verify:** Returns to default locale (English)

---

## 📱 Mobile Responsiveness

### Language Selector (Mobile)

- [ ] Opens as dropdown/modal on mobile
- [ ] Touch-friendly size
- [ ] Displays flags correctly
- [ ] Selected language highlighted

### Form Fields (Mobile)

- [ ] Labels readable
- [ ] Input fields appropriately sized
- [ ] Validation messages display correctly
- [ ] Submit button accessible

---

## ♿ Accessibility

### ARIA Labels (EN)

- [ ] `aria-label="Retry save"` on retry button
- [ ] `aria-label="Switch to Manual Entry"` on flow toggle
- [ ] Form fields have proper labels

### ARIA Labels (NL)

- [ ] `aria-label="Opnieuw proberen"` on retry button
- [ ] `aria-label="Overschakelen naar Handmatige Invoer"` on flow toggle
- [ ] Form fields have proper labels in Dutch

### Screen Reader Testing

- [ ] Tab through interface
- [ ] Verify screen reader announces translations correctly
- [ ] Focus indicators visible
- [ ] Skip links work

---

## 🐛 Known Issues & Workarounds

Document any translation issues found during testing:

| Issue | Locale | Component | Severity | Workaround |
|-------|--------|-----------|----------|------------|
| _Example: Button text too long_ | NL | Submit | Low | _Shorten text_ |
|  |  |  |  |  |

---

## ✅ Final Sign-Off

### Before Production Deployment

- [ ] All checklist items above passed
- [ ] `npm run i18n:check` returns 0 errors
- [ ] No console errors related to missing translations
- [ ] Both locales tested on staging environment
- [ ] Mobile testing completed
- [ ] Accessibility audit passed
- [ ] Known issues documented and triaged

### Sign-Off

- **Tester Name:** ___________________________
- **Date:** ___________________________
- **Build Version:** ___________________________
- **Status:** [ ] APPROVED [ ] NEEDS FIXES

---

**Last Updated**: January 13, 2026  
**Version**: 1.0.0
