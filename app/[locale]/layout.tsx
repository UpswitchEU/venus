/**
 * Locale Layout - Wraps all routes with i18n context
 * Provides translations and locale information to all child routes
 */

import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales, type Locale } from '../../i18n';

interface LocaleLayoutProps {
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}

// Only generate static params for public routes
export function generateStaticParams() {
	return locales.map((locale) => ({ locale }));
}

// Allow dynamic params - this enables dynamic rendering for routes not in generateStaticParams
export const dynamicParams = true;

// Make the layout dynamic to prevent static generation issues with next-intl
export const dynamic = 'force-dynamic';

/**
 * Generate metadata with locale support
 */
export async function generateMetadata({
	params,
}: LocaleLayoutProps): Promise<Metadata> {
	const { locale } = await params;
	
	// Validate locale before generating metadata
	if (!locales.includes(locale as Locale)) {
		return {
			title: 'Page Not Found',
		};
	}
	
	return {
		title: {
			default: 'UpSwitch Valuation Tester',
			template: '%s | UpSwitch Valuation Tester',
		},
	};
}

export default async function LocaleLayout({
	children,
	params,
}: LocaleLayoutProps) {
	const { locale } = await params;
	
	// Validate locale
	if (!locales.includes(locale as Locale)) {
		notFound();
	}

	// Load messages for the current locale with error handling
	let messages;
	try {
		messages = await getMessages({ locale });
	} catch (error) {
		console.error('Failed to load messages for locale:', locale, error);
		// Fallback to empty messages object to prevent crash
		messages = {};
	}

	return (
		<NextIntlClientProvider locale={locale} messages={messages}>
			{children}
		</NextIntlClientProvider>
	);
}

