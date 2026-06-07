/**
 * Locale constants — aligned with Mercury for BE/NL primary market
 *
 * Single source of truth for Venus i18n.
 * LANGUAGES: Nederlands first (primary market), text-only labels.
 */

export const locales = ['en', 'nl', 'fr'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'nl'

/** Language options for switchers — text-only, Nederlands first */
export const LANGUAGES = [
  { code: 'nl' as const, name: 'Nederlands' },
  { code: 'en' as const, name: 'English' },
  { code: 'fr' as const, name: 'Français' },
] as const
