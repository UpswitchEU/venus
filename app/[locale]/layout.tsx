/**
 * Locale Layout - Wraps all routes with i18n context
 * Provides translations and locale information to all child routes
 */

import type { Metadata } from 'next'
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

  // Get locale from request context (set by middleware) as fallback
  // This ensures next-intl can find the locale even if params resolution fails
  let requestLocale: string | undefined
  try {
    requestLocale = await getLocale()
  } catch (_e) {
    // getLocale() can fail if called outside request context - that's OK
    requestLocale = undefined
  }

  // Use request locale if available, otherwise use resolved locale from params
  // Ensure we always have a valid locale string
  const finalLocale: string = requestLocale || locale || 'en'

  // Validate final locale
  const validFinalLocale: Locale = locales.includes(finalLocale as Locale)
    ? (finalLocale as Locale)
    : 'en'

  // Load messages for the current locale with comprehensive error handling
  // CRITICAL: Never throw errors - always return valid data to prevent Server Components render errors
  let messages: Record<string, any> = {}
  try {
    // Try to get messages using request context locale first (most reliable)
    // If that fails, fall back to explicit locale
    try {
      const contextMessages = await getMessages()
      // Validate messages object
      if (contextMessages && typeof contextMessages === 'object') {
        messages = contextMessages
      }
    } catch (contextError) {
      // If request context doesn't have locale, use explicit locale
      try {
        const explicitMessages = await getMessages({ locale: validFinalLocale })
        // Validate messages object
        if (explicitMessages && typeof explicitMessages === 'object') {
          messages = explicitMessages
        }
      } catch (explicitError) {
        // Both methods failed - use empty object (non-fatal)
        console.warn(`[LocaleLayout] Failed to load messages (both methods), using empty object`, {
          locale: validFinalLocale,
          contextError: contextError instanceof Error ? contextError.message : String(contextError),
          explicitError:
            explicitError instanceof Error ? explicitError.message : String(explicitError),
        })
        messages = {}
      }
    }

    // Ensure messages is a plain object (not undefined/null)
    if (!messages || typeof messages !== 'object') {
      console.warn(
        `[LocaleLayout] Invalid messages for locale: ${validFinalLocale}, using empty object`
      )
      messages = {}
    }
  } catch (error) {
    // CRITICAL: Catch any unexpected errors and prevent Server Components render error
    console.error(
      `[LocaleLayout] Unexpected error loading messages for locale: ${validFinalLocale}`,
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }
    )
    // Fallback to empty messages object - app will still work
    messages = {}
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
