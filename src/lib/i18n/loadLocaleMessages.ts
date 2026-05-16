import type { AbstractIntlMessages } from 'next-intl'
import type { Locale } from '../../../i18n'

/**
 * Loads base `messages/{locale}.json` and merges `messages/startupStudio/{locale}.json`
 * under the `startupStudio` namespace.
 */
export async function loadLocaleMessages(validLocale: Locale): Promise<AbstractIntlMessages> {
  const base = (await import(`../../../messages/${validLocale}.json`)).default
  let startupStudio: Record<string, unknown> = {}
  try {
    startupStudio = (await import(`../../../messages/startupStudio/${validLocale}.json`))
      .default as Record<string, unknown>
  } catch {
    try {
      startupStudio = (await import(`../../../messages/startupStudio/en.json`)).default as Record<
        string,
        unknown
      >
    } catch {
      /* startupStudio bundle optional during partial rollout */
    }
  }
  return { ...base, startupStudio } as AbstractIntlMessages
}
