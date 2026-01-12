/**
 * next-intl configuration file
 * This file is required by next-intl to locate the request config
 * Re-exports from i18n.ts
 */

import { getRequestConfig } from 'next-intl/server';
import { locales, defaultLocale, type Locale } from './i18n';

export default getRequestConfig(async ({ locale }) => {
	// Validate that the incoming locale is valid
	// FIX: Don't call notFound() as it causes Server Component errors during SSR in iframe context
	// Instead, fall back to default locale for robustness
	if (!locale || !locales.includes(locale as Locale)) {
		console.warn(`[next-intl.config] Invalid locale requested: ${locale}, falling back to ${defaultLocale}`);
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

