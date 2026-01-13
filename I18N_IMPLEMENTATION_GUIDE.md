# i18n Implementation Guide - Venus

## 🏗️ Architecture Overview

Venus uses **next-intl** for internationalization, providing type-safe, performant translations across the application.

### Tech Stack

- **Framework**: next-intl v4.7.0
- **Languages**: English (en), Dutch (nl)
- **Default Locale**: English (en)
- **Routing**: Locale-based (`/en/*`, `/nl/*`)
- **Storage**: Cookie-based persistence (`NEXT_LOCALE`)

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Venus Application                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              UI Components Layer                      │  │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────┐           │  │
│  │  │ Toolbar │  │  Forms   │  │  Modals  │  ...      │  │
│  │  └────┬────┘  └─────┬────┘  └─────┬────┘           │  │
│  │       │             │              │                 │  │
│  │       └─────────────┴──────────────┘                 │  │
│  └──────────────────────┬──────────────────────────────┘  │
│                         │                                   │
│  ┌──────────────────────▼──────────────────────────────┐  │
│  │            useI18n Hook (Custom Wrapper)            │  │
│  │  • Translation function (t)                         │  │
│  │  • Locale info                                      │  │
│  │  • Change language                                  │  │
│  │  • Format utilities (currency, date, number)       │  │
│  └──────────────────────┬──────────────────────────────┘  │
│                         │                                   │
│  ┌──────────────────────▼──────────────────────────────┐  │
│  │         next-intl (Core i18n Framework)             │  │
│  │  • useTranslations()                                │  │
│  │  • useLocale()                                      │  │
│  │  • Message loading                                  │  │
│  └──────────────────────┬──────────────────────────────┘  │
│                         │                                   │
│  ┌──────────────────────▼──────────────────────────────┐  │
│  │           Message Files (JSON)                      │  │
│  │  ┌─────────────┐         ┌─────────────┐          │  │
│  │  │  en.json    │         │  nl.json    │          │  │
│  │  │  (645 keys) │         │  (645 keys) │          │  │
│  │  └─────────────┘         └─────────────┘          │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

External:
  ┌────────────────────────┐
  │  Translation Checker   │  ← npm run i18n:check
  │  (check-translations)  │
  └────────────────────────┘
```

---

## 📁 File Structure

```
apps/venus/
├── i18n.ts                          # i18n configuration
├── next-intl.config.ts              # next-intl config
├── middleware.ts                    # Locale detection middleware
├── messages/
│   ├── en.json                      # English translations (645 keys)
│   └── nl.json                      # Dutch translations (645 keys)
├── src/
│   ├── hooks/
│   │   └── useI18n.ts              # Custom i18n hook with utilities
│   ├── components/
│   │   ├── LanguageSelector.tsx    # Language switcher component
│   │   └── [other components]       # All use useTranslations()
│   └── app/
│       ├── [locale]/                # Locale-based routes
│       │   ├── layout.tsx
│       │   └── page.tsx
│       └── api/
│           └── user/
│               └── language/
│                   └── route.ts     # Update user language preference
├── scripts/
│   └── check-translations.cjs       # Translation validation script
├── TRANSLATION_WORKFLOW.md          # Developer workflow guide
└── I18N_IMPLEMENTATION_GUIDE.md     # This file
```

---

## 🔧 Core Configuration

### 1. i18n Configuration (`i18n.ts`)

```typescript
import { getRequestConfig } from 'next-intl/server';

export const locales = ['en', 'nl'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export default getRequestConfig(async ({ locale }) => {
  // Handle undefined locale (build/SSR)
  if (!locale) {
    locale = defaultLocale;
  }

  // Validate locale
  if (!locales.includes(locale as Locale)) {
    locale = defaultLocale;
  }

  const validLocale: Locale = locales.includes(locale as Locale) 
    ? (locale as Locale) 
    : defaultLocale;

  // Load messages with error handling
  let messages;
  try {
    messages = (await import(`./messages/${validLocale}.json`)).default;
  } catch (error) {
    console.error(`Failed to load messages for locale: ${validLocale}`, error);
    // Fallback to English
    if (validLocale !== 'en') {
      try {
        messages = (await import(`./messages/en.json`)).default;
      } catch (fallbackError) {
        console.error('Failed to load fallback English messages', fallbackError);
        messages = {};
      }
    } else {
      messages = {};
    }
  }

  return {
    locale: validLocale,
    messages,
    timeZone: 'Europe/Brussels',
  };
});
```

### 2. Custom Hook (`src/hooks/useI18n.ts`)

```typescript
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { locales, type Locale } from '../../i18n';

export function useI18n() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  /**
   * Change the current language
   * Updates URL and persists to cookie
   */
  const changeLanguage = (newLocale: Locale) => {
    if (!locales.includes(newLocale)) {
      console.error(`Invalid locale: ${newLocale}`);
      return;
    }

    // Replace current locale in pathname
    const pathWithoutLocale = pathname.replace(/^\/(en|nl)/, '');
    const newPath = `/${newLocale}${pathWithoutLocale}`;

    // Set cookie to persist language preference
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;

    // Navigate to new path
    router.push(newPath);

    // Update user preference via API (if authenticated)
    updateUserLanguagePreference(newLocale);
  };

  /**
   * Format currency as EUR
   */
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  /**
   * Format date according to locale
   */
  const formatDate = (date: Date | string): string => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat(locale).format(dateObj);
  };

  /**
   * Format number according to locale
   */
  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat(locale).format(num);
  };

  return {
    t,
    locale,
    changeLanguage,
    formatCurrency,
    formatDate,
    formatNumber,
    getAvailableLocales: () => locales,
    getCurrentLocale: () => locale,
  };
}

async function updateUserLanguagePreference(locale: Locale) {
  try {
    const hasToken = document.cookie.includes('upswitch_access_token');
    if (!hasToken) return;

    const response = await fetch('/api/user/language', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: locale }),
    });

    if (!response.ok) {
      console.warn('Failed to update user language preference');
    }
  } catch (error) {
    console.error('Error updating language preference:', error);
  }
}
```

### 3. Language Selector Component

```typescript
'use client';

import { useI18n } from '../hooks/useI18n';
import { Globe } from 'lucide-react';

export function LanguageSelector() {
  const { locale, changeLanguage, t } = useI18n();

  const languages = [
    { code: 'en' as const, name: 'English', flag: '🇬🇧' },
    { code: 'nl' as const, name: 'Nederlands', flag: '🇧🇪' },
  ];

  return (
    <div className="relative">
      <select
        value={locale}
        onChange={(e) => changeLanguage(e.target.value as any)}
        className="appearance-none bg-zinc-800 text-white px-3 py-2 rounded-lg"
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.flag} {lang.name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

---

## 💻 Usage Examples

### Basic Component Translation

```typescript
'use client';

import { useTranslations } from 'next-intl';

export function MyComponent() {
  const t = useTranslations();

  return (
    <div>
      <h1>{t('valuation.title')}</h1>
      <p>{t('valuation.subtitle')}</p>
      <button>{t('common.actions.calculate')}</button>
    </div>
  );
}
```

### With Custom Hook (Formatting)

```typescript
'use client';

import { useI18n } from '@/hooks/useI18n';

export function PriceDisplay({ price }: { price: number }) {
  const { t, formatCurrency, formatNumber } = useI18n();

  return (
    <div>
      <h3>{t('valuation.results.estimatedValue')}</h3>
      <p>{formatCurrency(price)}</p>
      <span>{formatNumber(price)} EUR</span>
    </div>
  );
}
```

### Form Validation

```typescript
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function ValuationForm() {
  const t = useTranslations();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (formData: any) => {
    const newErrors: Record<string, string> = {};

    if (!formData.revenue) {
      newErrors.revenue = t('forms.validation.required', {
        field: t('forms.fields.revenue')
      });
    }

    if (formData.revenue && formData.revenue < 0) {
      newErrors.revenue = t('forms.validation.positiveNumber', {
        field: t('forms.fields.revenue')
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  return (
    <form>
      <input name="revenue" />
      {errors.revenue && <span className="error">{errors.revenue}</span>}
    </form>
  );
}
```

### Toast Notifications

```typescript
import { toast } from 'react-hot-toast';
import { useTranslations } from 'next-intl';

export function useValuationActions() {
  const t = useTranslations();

  const saveValuation = async (data: any) => {
    try {
      toast.loading(t('common.states.saving'));
      await api.save(data);
      toast.dismiss();
      toast.success(t('success.saved'));
    } catch (error) {
      toast.dismiss();
      toast.error(t('errors.generic'));
    }
  };

  return { saveValuation };
}
```

### Conditional Translations

```typescript
export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations();

  const getStatusKey = (status: string) => {
    const statusMap: Record<string, string> = {
      'pending': 'common.states.pending',
      'in_progress': 'common.states.inProgress',
      'complete': 'common.states.complete',
      'failed': 'common.states.failed',
    };
    return statusMap[status] || 'common.states.pending';
  };

  return <span>{t(getStatusKey(status))}</span>;
}
```

---

## 🎯 Translation Key Structure

### Hierarchical Organization

```json
{
  "category": {
    "subcategory": {
      "feature": {
        "key": "Value"
      }
    }
  }
}
```

### Examples by Category

**1. Common Actions**
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

**2. Form Fields**
```json
{
  "forms": {
    "fields": {
      "revenue": "Annual Revenue",
      "ebitda": "EBITDA"
    }
  }
}
```

**3. Validation Messages**
```json
{
  "forms": {
    "validation": {
      "required": "{field} is required",
      "minValue": "{field} must be at least {min}"
    }
  }
}
```

**4. Feature-Specific**
```json
{
  "valuation": {
    "manual": {
      "title": "Manual Valuation",
      "description": "Enter your business details manually"
    }
  }
}
```

---

## 🧪 Testing Translations

### Manual Testing Checklist

```bash
# 1. Start development server
npm run dev

# 2. Navigate to both locales
http://localhost:3001/en
http://localhost:3001/nl

# 3. Test language switcher
# Click language selector and verify:
# - URL changes to new locale
# - All text updates
# - Cookie is set
# - Page doesn't reload

# 4. Test form validation
# Submit forms with errors and verify:
# - Error messages in correct language
# - Field labels translated
# - Help text translated

# 5. Test dynamic content
# - Toast notifications
# - Modal dialogs
# - Empty states
# - Loading states

# 6. Test number formatting
# - Currency displays (€1,000.00 vs € 1.000,00)
# - Large numbers (1,234,567.89 vs 1.234.567,89)

# 7. Test date formatting
# - Short dates (1/13/2026 vs 13-1-2026)
# - Long dates (January 13, 2026 vs 13 januari 2026)
```

### Automated Testing

```typescript
// Example test with next-intl
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  it('displays translated text', () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <MyComponent />
      </NextIntlClientProvider>
    );

    expect(screen.getByText('Business Valuation')).toBeInTheDocument();
  });
});
```

---

## 🚨 Common Pitfalls & Solutions

### 1. Missing Translation Keys

**Problem:** Key not found error in console

```
Missing translation: forms.actions.calculate
```

**Solution:**
- Add key to `messages/en.json` and `messages/nl.json`
- Run `npm run i18n:check` to verify

### 2. Translation Shows as Key

**Problem:** Button shows "common.actions.save" instead of "Save"

**Causes:**
- Missing translation in current locale
- Typo in key path
- `useTranslations()` not called correctly

**Solution:**
```typescript
// ❌ Wrong
const t = 'useTranslations()';

// ✅ Correct
const t = useTranslations();
```

### 3. Variables Not Replaced

**Problem:** Shows "Saved {time} ago" instead of "Saved 5m ago"

**Solution:**
```typescript
// ❌ Wrong
t('common.states.savedTimeAgo')

// ✅ Correct
t('common.states.savedTimeAgo', { time: '5m' })
```

### 4. Client/Server Mismatch

**Problem:** Hydration error due to server/client locale mismatch

**Solution:**
- Always use `'use client'` directive for components using translations
- Use middleware for proper locale detection
- Set cookie on language change

### 5. Missing Translation in Production

**Problem:** Translations work locally but not in production

**Causes:**
- Translation files not included in build
- Environment variable misconfiguration
- Caching issues

**Solution:**
- Verify `messages/` folder is included in deployment
- Check `next.config.mjs` includes i18n configuration
- Clear cache and rebuild

---

## 🔄 Integration with Mercury

Venus and Mercury share the same locale system for seamless cross-app navigation.

### Shared Configuration

```typescript
// Both apps use:
- Same locales: ['en', 'nl']
- Same cookie name: 'NEXT_LOCALE'
- Same API endpoint: /api/user/language
```

### Cross-App Navigation

```typescript
// When navigating from Mercury to Venus:
// 1. Mercury sets NEXT_LOCALE cookie
// 2. User clicks valuation link → opens Venus
// 3. Venus reads NEXT_LOCALE cookie
// 4. Venus displays in same language

// When navigating from Venus to Mercury:
// 1. Venus updates NEXT_LOCALE cookie on language change
// 2. User returns to Mercury
// 3. Mercury reads updated cookie
// 4. Mercury displays in new language
```

### API Integration

```typescript
// PUT /api/user/language
// Body: { language: 'nl' }
// 
// Both apps call this endpoint when language changes
// Persists preference to database for authenticated users
```

---

## 📊 Performance Considerations

### Message Loading

```typescript
// Messages are lazy-loaded per route
// Only the required locale is loaded
// Uses Next.js dynamic imports for code splitting

// Example: When user visits /en/dashboard
// Only en.json is loaded (not nl.json)
```

### Bundle Size

```
messages/en.json:  ~45KB (uncompressed)
messages/nl.json:  ~47KB (uncompressed)

After gzip:       ~8KB per locale
```

### Caching

```typescript
// next-intl caches messages in memory
// No re-fetch on navigation within same locale
// New locale triggers message load
```

---

## 🛠️ Maintenance

### Adding New Translations

1. Add key to `messages/en.json`
2. Translate to `messages/nl.json`
3. Run `npm run i18n:check`
4. Commit both files together

### Updating Existing Translations

1. Update in `messages/en.json`
2. Update corresponding key in `messages/nl.json`
3. Run `npm run i18n:check`
4. Test affected components

### Deprecating Translations

1. Remove usage from components
2. Keep keys in JSON files for 1 release (safety)
3. Remove keys after confirming no usage
4. Run `npm run i18n:check`

---

## 📚 References

- [next-intl Documentation](https://next-intl-docs.vercel.app/)
- [Next.js i18n Routing](https://nextjs.org/docs/app/building-your-application/routing/internationalization)
- [Intl API Reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)
- [ICU Message Format](https://unicode-org.github.io/icu/userguide/format_parse/messages/)

---

**Last Updated**: January 13, 2026  
**Version**: 1.0.0  
**Maintained by**: Frontend Team
