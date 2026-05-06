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

    for (const cfg of Object.values(QUALITY_WARNING_ASSISTANT_CTA_CONFIG)) {
      expect(Object.prototype.hasOwnProperty.call(en, cfg.labelKey)).toBe(true)
      expect(Object.prototype.hasOwnProperty.call(en, cfg.promptKey)).toBe(true)
      expect(Object.prototype.hasOwnProperty.call(nl, cfg.labelKey)).toBe(true)
      expect(Object.prototype.hasOwnProperty.call(nl, cfg.promptKey)).toBe(true)
    }
  })
})
