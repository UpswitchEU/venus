/**
 * i18n Configuration for Venus Platform
 * 
 * Configures internationalization with next-intl
 * Supports: English (en), Dutch (nl)
 */

import { getRequestConfig } from 'next-intl/server';

// Supported locales
export const locales = ['en', 'nl'] as const;
export type Locale = (typeof locales)[number];

// Default locale
export const defaultLocale: Locale = 'en';

/**
 * Load messages for the given locale
 */
export default getRequestConfig(async ({ locale }) => {
	// Handle undefined locale (can happen during build/SSR before middleware runs)
	// This is normal and expected - just use default locale
	if (!locale) {
		locale = defaultLocale;
	}

	// Validate that the incoming locale is valid
	// FIX: Don't call notFound() as it causes Server Component errors during SSR
	// Instead, fall back to default locale for robustness
	if (!locales.includes(locale as Locale)) {
		// Only warn if locale was provided but invalid (not undefined)
		if (locale !== defaultLocale) {
			console.warn(`[i18n] Invalid locale requested: ${locale}, falling back to ${defaultLocale}`);
		}
		locale = defaultLocale;
	}

	// Ensure locale is a valid string (TypeScript guard)
	const validLocale: Locale = locales.includes(locale as Locale) ? (locale as Locale) : defaultLocale;

	// Load messages with error handling
	let messages;
	try {
		messages = (await import(`./messages/${validLocale}.json`)).default;
	} catch (error) {
		console.error(`Failed to load messages for locale: ${validLocale}`, error);
		// Fallback to English messages if locale-specific messages fail to load
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
		timeZone: 'Europe/Brussels', // Default timezone for EU operations
		// Removed now: new Date() - Date objects cannot be serialized and may cause SSR errors
	};
});

/**
 * Check if a locale is valid
 */
export function isValidLocale(locale: string): locale is Locale {
	return locales.includes(locale as Locale);
}

/**
 * Get locale from pathname
 */
export function getLocaleFromPathname(pathname: string): Locale | null {
	const segments = pathname.split('/');
	const potentialLocale = segments[1];
	return isValidLocale(potentialLocale) ? potentialLocale : null;
}
