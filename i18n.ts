/**
 * i18n Configuration for Venus Platform
 * 
 * Configures internationalization with next-intl
 * Supports: English (en), Dutch (nl)
 */

import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

// Supported locales
export const locales = ['en', 'nl'] as const;
export type Locale = (typeof locales)[number];

// Default locale
export const defaultLocale: Locale = 'en';

/**
 * Load messages for the given locale
 */
export default getRequestConfig(async ({ locale }) => {
	// Validate that the incoming locale is valid
	if (!locale || !locales.includes(locale as Locale)) {
		notFound();
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
		now: new Date(),
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
