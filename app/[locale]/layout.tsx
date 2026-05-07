/**
 * Locale Layout - Wraps all routes with i18n context
 * Provides translations and locale information to all child routes
 */

import type { Metadata } from 'next'
import type { AbstractIntlMessages } from 'next-intl'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { type Locale, locales } from '../../i18n'
import { LocaleHtmlSync } from '../../src/components/LocaleHtmlSync'

interface LocaleLayoutProps {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

// Only generate static params for public routes
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

// Allow dynamic params - this enables dynamic rendering for routes not in generateStaticParams
export const dynamicParams = true

// Make the layout dynamic to prevent static generation issues with next-intl
export const dynamic = 'force-dynamic'

/**
 * Generate metadata with locale support
 */
export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
  // Safely await params with error handling
  let locale: string
  try {
    const resolvedParams = await params
    locale = resolvedParams?.locale || 'en'
  } catch (error) {
    console.error('Failed to resolve locale params in generateMetadata:', error)
    locale = 'en' // Fallback to default locale
  }

  // Validate locale before generating metadata
  if (!locales.includes(locale as Locale)) {
    locale = 'en' // Fallback to default locale instead of 404
  }

  const defaultTitle =
    locale === 'en'
      ? 'Upswitch | Indicative business estimate'
      : 'Upswitch | Indicatieve bedrijfsschatting'

  return {
    title: {
      default: defaultTitle,
      template: '%s | Upswitch',
    },
  }
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  // Safely await params with error handling
  let locale: string = 'en' // Default fallback
  try {
    const resolvedParams = await params
    locale = resolvedParams?.locale || 'en'
  } catch (error) {
    console.error('[LocaleLayout] Failed to resolve locale params:', error)
    locale = 'en' // Fallback to default locale
  }

  // Validate locale - ensure it's always valid
  // Silently handle invalid locales (can happen with favicon requests, etc.)
  if (!locale || !locales.includes(locale as Locale)) {
    // Don't warn for file extensions or empty strings - these are expected
    if (locale && !locale.includes('.')) {
      console.warn(`[LocaleLayout] Invalid locale: ${locale}, falling back to 'en'`)
    }
    locale = 'en'
  }

  // CRITICAL: Prefer params.locale (from URL path) over getLocale() (from request context).
  // When user navigates to /nl/reports/xxx, params.locale is 'nl' - that must win.
  // getLocale() can return 'en' from NEXT_LOCALE cookie or Accept-Language, which would
  // incorrectly override the explicit path locale (Mercury→Venus Dutch persistence bug).
  let requestLocale: string | undefined
  try {
    requestLocale = await getLocale()
  } catch (_e) {
    requestLocale = undefined
  }

  // Path locale (params) always wins when valid - ensures Mercury /nl/ → Venus shows Dutch
  const finalLocale: string =
    locale && locales.includes(locale as Locale) ? locale : requestLocale || locale || 'en'

  // Validate final locale
  const validFinalLocale: Locale = locales.includes(finalLocale as Locale)
    ? (finalLocale as Locale)
    : 'en'

  // Load messages for the validated locale
  // Always pass locale explicitly so we never depend on request context alone
  let messages: AbstractIntlMessages = {}
  try {
    const loaded = await getMessages({ locale: validFinalLocale })
    if (loaded && typeof loaded === 'object') {
      messages = loaded
    }
  } catch (error) {
    console.error(
      `[LocaleLayout] Failed to load messages for locale: ${validFinalLocale}`,
      error instanceof Error ? error.message : String(error)
    )
    // Fallback: same merge as request config (base + startupStudio overlay)
    try {
      const { loadLocaleMessages } = await import('@/lib/i18n/loadLocaleMessages')
      messages = await loadLocaleMessages(validFinalLocale)
    } catch (_fallbackError) {
      if (validFinalLocale !== 'en') {
        try {
          const { loadLocaleMessages } = await import('@/lib/i18n/loadLocaleMessages')
          messages = await loadLocaleMessages('en')
        } catch {
          try {
            messages = (await import(`../../messages/en.json`)).default as AbstractIntlMessages
          } catch {
            // Keep empty as last resort
          }
        }
      }
    }
  }

  // Use the validated final locale for the provider
  const validLocale: Locale = validFinalLocale

  return (
    <NextIntlClientProvider locale={validLocale} messages={messages}>
      <LocaleHtmlSync locale={validLocale} />
      {children}
    </NextIntlClientProvider>
  )
}
