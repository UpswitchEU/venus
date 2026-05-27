import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { QUALITY_WARNING_ASSISTANT_CTA_CONFIG } from './methodFieldConfig'

type MessagesShape = {
  chatAssistant?: Record<string, unknown>
}

function readMessages(locale: 'en' | 'nl'): MessagesShape {
  const here = dirname(fileURLToPath(import.meta.url))
  const abs = join(here, '../../messages', `${locale}.json`)
  return JSON.parse(readFileSync(abs, 'utf8')) as MessagesShape
}

describe('QUALITY_WARNING_ASSISTANT_CTA_CONFIG i18n coverage', () => {
  it('has every CTA key in both EN and NL chatAssistant namespaces', () => {
    const en = readMessages('en').chatAssistant ?? {}
    const nl = readMessages('nl').chatAssistant ?? {}

    // Walk every property whose name ends in `Key` so new fields added to
    // the config (e.g. titleKey / bodyKey) are automatically covered without
    // having to remember to update this test.
    for (const [type, cfg] of Object.entries(QUALITY_WARNING_ASSISTANT_CTA_CONFIG)) {
      for (const [field, value] of Object.entries(cfg as Record<string, unknown>)) {
        if (!field.endsWith('Key')) continue
        if (typeof value !== 'string') continue
        expect(Object.hasOwn(en, value), `EN missing ${field} (${value}) for ${type}`).toBe(true)
        expect(Object.hasOwn(nl, value), `NL missing ${field} (${value}) for ${type}`).toBe(true)
      }
    }
  })

  it('rewritten method_substitution title no longer leads with "could not"', () => {
    const en = readMessages('en').chatAssistant as Record<string, string>
    const nl = readMessages('nl').chatAssistant as Record<string, string>
    // Regression guard against the original failure-led copy. The advisor
    // must NOT see "could not be executed" at the top of a successful report.
    expect(en.qualityTitleMethodSubstitution.toLowerCase()).not.toMatch(/could not/)
    expect(nl.qualityTitleMethodSubstitution.toLowerCase()).not.toMatch(/kon niet/)
  })
})
