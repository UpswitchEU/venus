/**
 * Valuation method keys → next-intl paths under `manualInput.methodSelector.*`.
 *
 * Derived view over `@/lib/methods/registry.ts` — each `MethodSpec` declares
 * its `labelKey` (short) and optional `descriptionKey` (long-form tooltip).
 * Adding an 11th method means editing one spec; both maps update automatically.
 */

import {
  deriveMethodDescriptionKeys,
  deriveMethodLabelKeys,
} from '@/lib/methods/registry'

export const METHOD_LABEL_KEYS: Record<string, string> = deriveMethodLabelKeys()

/** Methods that show an info tooltip in the nav dropdown (long-form i18n description). */
export const METHOD_DESCRIPTION_KEYS: Record<string, string> = deriveMethodDescriptionKeys()
