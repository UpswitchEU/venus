/**
 * i18n Configuration for Venus Platform
 * 
 * Configures internationalization with next-intl
 * Supports: English (en), Dutch (nl)
 */

import { getRequestConfig } from 'next-intl/server';

import { loadLocaleMessages } from './src/lib/i18n/loadLocaleMessages';

// Supported locales
export const locales = ['en', 'nl'] as const;
export type Locale = (typeof locales)[number];

// Default locale — nl for Belgian/Dutch market (align with Mercury)
export const defaultLocale: Locale = 'nl';

/**
 * Load messages for the given locale
 */
export default getRequestConfig(async ({ requestLocale }) => {
	// next-intl v4: requestLocale is a Promise resolving to the [locale] dynamic segment
	let locale = await requestLocale;

	if (!locale || !locales.includes(locale as Locale)) {
		locale = defaultLocale;
	}

	const validLocale: Locale = locale as Locale;

	// Load messages with error handling (base JSON + startupStudio overlay)
	let messages;
	try {
		messages = await loadLocaleMessages(validLocale);
	} catch (error) {
		console.error(`Failed to load messages for locale: ${validLocale}`, error);
		if (validLocale !== 'en') {
			try {
				messages = await loadLocaleMessages('en');
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
