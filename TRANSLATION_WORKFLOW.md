# Translation Workflow Guide - Venus

## 📝 Quick Reference

**Golden Rule**: Always update English first, then translate to other languages.

```bash
# Check translation status
npm run i18n:check

# The output shows which translations are missing or incomplete
```

---

## 🔄 Step-by-Step Workflow

### 1. **Update English Content** (Primary Language)

When you need to add or change copy:

**Example: Adding a new feature**

```json
// messages/en.json

{
  "navigation": {
    "tabs": {
      "preview": "Preview",
      "info": "Info",
      // ✅ ADD NEW KEY HERE FIRST
      "analytics": "Analytics"
    }
  },
  "valuation": {
    "title": "Business Valuation",
    // ✅ CHANGE EXISTING TEXT HERE
    "subtitle": "Professional valuation for your business"
  }
}
```

**Tips for English updates:**
- Use clear, descriptive keys (e.g., `forms.validation.required` not `err1`)
- Keep translations short and punchy for UI elements
- Add comments for context if needed
- Group related translations together
- Use nested structure for organization

### 2. **Check What Needs Translation**

After updating English, run the checker:

```bash
npm run i18n:check
```

**Output example:**
```
🌍 Translation Status Checker for Venus

📄 English (source): 645 keys
📄 Dutch (target):   642 keys

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Dutch (nl) Translation Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Completion: 99.5%
✅ Translated: 642/645 keys

❌ Missing 3 Dutch translation(s):

  [navigation]:
    - navigation.tabs.analytics
      EN: "Analytics"

  [valuation]:
    - valuation.subtitle
      EN: "Professional valuation for your business"
    - valuation.actions.export
      EN: "Export Report"
```

### 3. **Update Dutch Translations**

Open `messages/nl.json` and add the missing translations:

```json
// messages/nl.json

{
  "navigation": {
    "tabs": {
      "preview": "Voorbeeld",
      "info": "Info",
      // ✅ ADD DUTCH TRANSLATION
      "analytics": "Analytics"
    }
  },
  "valuation": {
    "title": "Bedrijfswaardering",
    // ✅ ADD DUTCH TRANSLATION
    "subtitle": "Professionele waardering voor uw bedrijf"
  }
}
```

**Translation Guidelines:**
- Maintain consistent tone and style
- Keep formatting (e.g., capitalization, punctuation)
- Preserve variables like `{name}`, `{count}`
- Test translations in context (buttons, labels, messages)
- Use formal "u" (not informal "je") for business context

### 4. **Verify Translations**

Run the checker again to confirm:

```bash
npm run i18n:check
```

If successful:
```
✅ All translations are up to date!
🎉 Venus is fully bilingual (EN/NL)
```

---

## 🎯 Common Translation Patterns

### 1. **Simple Strings**

```json
{
  "common": {
    "actions": {
      "save": "Save",
      "cancel": "Cancel",
      "submit": "Submit"
    }
  }
}
```

**Usage:**
```typescript
import { useTranslations } from 'next-intl';

const t = useTranslations();

<button>{t('common.actions.save')}</button>
```

### 2. **Parameterized Messages**

For dynamic content, use placeholders:

```json
{
  "common": {
    "states": {
      "savedTimeAgo": "Saved {time} ago"
    }
  },
  "forms": {
    "validation": {
      "required": "{field} is required",
      "minValue": "{field} must be at least {min}"
    }
  }
}
```

**Usage:**
```typescript
t('common.states.savedTimeAgo', { time: '5m' })
// Output: "Saved 5m ago"

t('forms.validation.required', { field: t('forms.fields.revenue') })
// Output: "Revenue is required"

t('forms.validation.minValue', { field: 'Revenue', min: 0 })
// Output: "Revenue must be at least 0"
```

### 3. **Conditional Translations**

```typescript
const getStatusText = (status: string) => {
  switch (status) {
    case 'pending':
      return t('common.states.pending');
    case 'in_progress':
      return t('common.states.inProgress');
    case 'complete':
      return t('common.states.complete');
    default:
      return t('common.states.unknown');
  }
};
```

### 4. **Pluralization**

For count-dependent translations:

```json
{
  "reports": {
    "count": "{count} report",
    "countPlural": "{count} reports"
  }
}
```

**Usage:**
```typescript
const count = 5;
const key = count === 1 ? 'reports.count' : 'reports.countPlural';
t(key, { count })
```

---

## 📂 Translation File Structure

Venus uses a hierarchical structure for organization:

```
messages/
├── en.json    (Source translations)
└── nl.json    (Dutch translations)
```

### Key Categories:

1. **common** - Shared actions, states, labels
2. **navigation** - Tabs, breadcrumbs, flows
3. **toolbar** - Toolbar actions and tooltips
4. **valuation** - Valuation-specific text
5. **forms** - Form fields, validation, help text
6. **businessProfile** - Company data, KBO lookup
7. **reports** - Report sections and actions
8. **versions** - Version history features
9. **errors** - Error messages by category
10. **modals** - Modal dialog content
11. **language** - Language selector
12. **user** - User profile and authentication
13. **loading** - Loading states and messages
14. **empty** - Empty state messages
15. **success** - Success notifications

---

## 🔧 Developer Integration

### Adding Translations to Components

**Step 1: Import the hook**
```typescript
import { useTranslations } from 'next-intl';
```

**Step 2: Get the translation function**
```typescript
const t = useTranslations();
```

**Step 3: Replace hardcoded strings**
```typescript
// ❌ Before
<button>Calculate Valuation</button>
<p>Failed to calculate valuation</p>

// ✅ After
<button>{t('forms.actions.calculate')}</button>
<p>{t('errors.calculation.description')}</p>
```

### Form Validation

```typescript
const { t } = useI18n();

// Validation messages
if (!revenue) {
  setError(t('forms.validation.required', { 
    field: t('forms.fields.revenue') 
  }));
}

if (revenue < 0) {
  setError(t('forms.validation.positiveNumber', { 
    field: t('forms.fields.revenue') 
  }));
}
```

### Toast Notifications

```typescript
import { toast } from 'react-hot-toast';
import { useTranslations } from 'next-intl';

const t = useTranslations();

// Success
toast.success(t('success.saved'));

// Error
toast.error(t('errors.calculation.description'));

// Loading
toast.loading(t('common.states.processing'));
```

---

## 🌍 Locale-Specific Formatting

### Numbers

```typescript
import { useI18n } from '@/hooks/useI18n';

const { formatNumber, formatCurrency } = useI18n();

// Format numbers according to locale
formatNumber(1234567.89)
// EN: "1,234,567.89"
// NL: "1.234.567,89"

// Format currency (always EUR)
formatCurrency(1000)
// EN: "€1,000.00"
// NL: "€ 1.000,00"
```

### Dates

```typescript
import { useI18n } from '@/hooks/useI18n';

const { formatDate } = useI18n();

// Format dates according to locale
formatDate(new Date())
// EN: "1/13/2026"
// NL: "13-1-2026"
```

---

## ✅ Best Practices

### DO:
- ✅ Always update English first
- ✅ Run `npm run i18n:check` before committing
- ✅ Use descriptive, hierarchical keys
- ✅ Test translations in context
- ✅ Keep translations concise for UI elements
- ✅ Preserve variables and formatting
- ✅ Document context with comments for ambiguous strings
- ✅ Group related translations together

### DON'T:
- ❌ Don't use generic keys like `text1`, `label2`
- ❌ Don't translate technical terms (e.g., "EBITDA", "KBO")
- ❌ Don't hardcode strings in components
- ❌ Don't forget to check for missing translations
- ❌ Don't mix casual and formal language
- ❌ Don't duplicate translations (use shared keys)
- ❌ Don't translate developer-facing messages

---

## 🐛 Troubleshooting

### Issue: Translation key not found

**Error:**
```
Missing translation: forms.actions.calculate
```

**Solution:**
1. Check if key exists in `messages/en.json`
2. Verify correct path (dot notation)
3. Run `npm run i18n:check` to see all missing keys

### Issue: Translation shows as key

**Example:** Button shows "common.actions.save" instead of "Save"

**Possible causes:**
1. Missing translation in current locale
2. Typo in translation key
3. `useTranslations()` not imported/called

**Solution:**
```typescript
// Make sure you're using the hook correctly
import { useTranslations } from 'next-intl';

const t = useTranslations();
// NOT: const t = 'useTranslations()' or const { t } = useTranslations()
```

### Issue: Variables not replaced

**Example:** Shows "Saved {time} ago" instead of "Saved 5m ago"

**Solution:**
```typescript
// Pass variables as second argument
t('common.states.savedTimeAgo', { time: '5m' })
```

### Issue: Translation checker fails

**Error:**
```
❌ Missing 5 Dutch translation(s)
```

**Solution:**
1. Note the missing keys from the error output
2. Add them to `messages/nl.json`
3. Run `npm run i18n:check` again

---

## 📊 Translation Coverage

Current coverage (as of last check):

| Language | Keys | Coverage |
|----------|------|----------|
| English (en) | 645 | 100% (source) |
| Dutch (nl) | 645 | 100% |

**Target:** 100% coverage for both languages before production deployment

---

## 🚀 Deployment Checklist

Before deploying:

- [ ] All English strings are translated to Dutch
- [ ] `npm run i18n:check` passes with 0 errors
- [ ] Translations tested in both languages
- [ ] Language selector works correctly
- [ ] Locale persistence across page refreshes
- [ ] No hardcoded strings in production code
- [ ] Form validation messages translated
- [ ] Error messages translated
- [ ] Toast notifications translated

---

## 📚 Related Documentation

- [I18N Implementation Guide](./I18N_IMPLEMENTATION_GUIDE.md) - Technical architecture
- [Mercury Translation Workflow](../mercury/TRANSLATION_WORKFLOW.md) - Cross-app consistency
- [next-intl Documentation](https://next-intl-docs.vercel.app/) - Framework reference

---

**Last Updated**: January 13, 2026  
**Maintained by**: Frontend Team  
**Questions?**: Check the implementation guide or ask in #frontend-dev
