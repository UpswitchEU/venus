/**
 * useI18n Hook
 * 
 * Custom hook that wraps next-intl functionality and provides
 * additional utilities for internationalization
 */

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
	 * Updates the URL and persists to cookie
	 */
	const changeLanguage = (newLocale: Locale) => {
		if (!locales.includes(newLocale)) {
			console.error(`Invalid locale: ${newLocale}`);
			return;
		}

		// Replace current locale in pathname with new locale
		const pathWithoutLocale = pathname.replace(/^\/(en|nl)/, '');
		const newPath = `/${newLocale}${pathWithoutLocale}`;

		// Set cookie to persist language preference
		document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;

		// Navigate to new path
		router.push(newPath);

		// If user is authenticated, update preference via API
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

	/**
	 * Get available locales
	 */
	const getAvailableLocales = () => locales;

	/**
	 * Get current locale
	 */
	const getCurrentLocale = () => locale;

	return {
		t,
		locale,
		changeLanguage,
		formatCurrency,
		formatDate,
		formatNumber,
		getAvailableLocales,
		getCurrentLocale,
	};
}

/**
 * Update user language preference via API (if authenticated)
 */
async function updateUserLanguagePreference(locale: Locale) {
	try {
		// Check if user is authenticated by looking for access token
		const hasToken = document.cookie.includes('upswitch_access_token');
		if (!hasToken) return;

		// Call API to update language preference
		const response = await fetch('/api/user/language', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ language: locale }),
		});

		if (!response.ok) {
			console.warn('Failed to update user language preference');
		}
	} catch (error) {
		console.error('Error updating language preference:', error);
	}
}
