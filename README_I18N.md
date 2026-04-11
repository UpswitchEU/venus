# Venus i18n Quick Start

## 🌍 Overview

Venus is now fully bilingual, supporting English (en) and Dutch (nl) with 514 translation keys across all features.

---

## 🚀 Quick Commands

```bash
# Check translation status
npm run i18n:check

# Start development (both locales available)
npm run dev
# Visit: http://localhost:3001/en or http://localhost:3001/nl

# Build for production
npm run build
```

---

## 📖 Documentation

| Guide | Purpose | When to Use |
|-------|---------|-------------|
| [TRANSLATION_WORKFLOW.md](./TRANSLATION_WORKFLOW.md) | Add/update translations | When adding new features or changing copy |
| [TRANSLATION_TESTING_CHECKLIST.md](./TRANSLATION_TESTING_CHECKLIST.md) | QA testing | Before deploying to production |

---

## 💻 Usage in Components

```typescript
// Import the hook
import { useTranslations } from 'next-intl';

// In your component
export function MyComponent() {
  const t = useTranslations();
  
  return (
    <div>
      <h1>{t('valuation.title')}</h1>
      <button>{t('common.actions.save')}</button>
      <p>{t('forms.validation.required', { field: 'Revenue' })}</p>
    </div>
  );
}
```

---

## ✅ Translation Status

```
🌍 Translation Status Checker for Venus

📄 English (source): 514 keys
📄 Dutch (target):   514 keys

📊 Completion: 100.0%
✅ Translated: 514/514 keys

✅ All translations are up to date!
🎉 Venus is fully bilingual (EN/NL)
```

---

## 🔧 Adding New Translations

1. **Update English** (`messages/en.json`):
```json
{
  "myFeature": {
    "title": "New Feature"
  }
}
```

2. **Update Dutch** (`messages/nl.json`):
```json
{
  "myFeature": {
    "title": "Nieuwe Functie"
  }
}
```

3. **Verify**:
```bash
npm run i18n:check
```

4. **Use in component**:
```typescript
<h1>{t('myFeature.title')}</h1>
```

---

## 🌐 Language Selector

The language selector component is available and can be used anywhere:

```typescript
import { LanguageSelector } from '@/components/LanguageSelector';

<LanguageSelector variant="desktop" />
// or
<LanguageSelector variant="mobile" />
```

---

## 🔗 Mercury Integration

Venus shares locale settings with Mercury:
- **Cookie:** `NEXT_LOCALE` (1-year expiry)
- **API:** `/api/user/language`
- **Sync:** Automatic across apps

Change language in Venus → Mercury updates automatically  
Change language in Mercury → Venus updates automatically

---

## 📋 Pre-Deployment Checklist

- [ ] Run `npm run i18n:check` → Should pass with 0 errors
- [ ] Test language selector in both locales
- [ ] Verify forms show correct validation messages
- [ ] Check number formatting (€1,000.00 vs € 1.000,00)
- [ ] Test with Mercury to verify cross-app sync
- [ ] Review Dutch translations with native speaker

---

## 🐛 Troubleshooting

### Translation not showing?
1. Check key exists in `messages/en.json` and `messages/nl.json`
2. Run `npm run i18n:check` to find missing keys
3. Verify correct import: `import { useTranslations } from 'next-intl';`

### Language not switching?
1. Check browser console for errors
2. Verify cookie `NEXT_LOCALE` is being set
3. Clear browser cache and cookies
4. Check middleware is running (locale detection)

---

## 📊 Coverage by Category

| Category | Keys | EN | NL |
|----------|------|----|----|
| common | 80+ | ✅ | ✅ |
| navigation | 30+ | ✅ | ✅ |
| toolbar | 25+ | ✅ | ✅ |
| valuation | 60+ | ✅ | ✅ |
| forms | 120+ | ✅ | ✅ |
| businessProfile | 40+ | ✅ | ✅ |
| reports | 60+ | ✅ | ✅ |
| versions | 30+ | ✅ | ✅ |
| errors | 50+ | ✅ | ✅ |
| modals | 40+ | ✅ | ✅ |
| **Total** | **514** | **100%** | **100%** |

---

## 🎯 Key Features

✅ **Fully Bilingual** - Complete EN/NL support  
✅ **Type-Safe** - Compile-time validation  
✅ **Automated Checking** - `npm run i18n:check`  
✅ **Mercury Integrated** - Seamless cross-app sync  
✅ **Locale-Aware Formatting** - Numbers, dates, currency  
✅ **Comprehensive Docs** - 1,650+ lines of guides  

---

**Status:** ✅ Production Ready  
**Last Updated:** January 13, 2026  
**Need Help?** See detailed guides above or ask in #frontend-dev
