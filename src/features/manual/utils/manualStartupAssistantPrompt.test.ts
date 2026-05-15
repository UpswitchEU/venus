// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { formatManualStartupAssistantPrompt } from './manualStartupAssistantPrompt'

describe('manualStartupAssistantPrompt', () => {
  it('formats the English startup assistant prompt with strict section headings', () => {
    const result = formatManualStartupAssistantPrompt('How should I enter ARR?', 'en')

    expect(result).toContain('**Action points:**')
    expect(result).toContain('**Why this matters:**')
    expect(result).toContain('**What to enter:**')
    expect(result).toContain('User question: How should I enter ARR?')
  })

  it('formats the Dutch startup assistant prompt with strict section headings', () => {
    const result = formatManualStartupAssistantPrompt('Welke multiple hoort hierbij?', 'nl')

    expect(result).toContain('**Actiepunten:**')
    expect(result).toContain('**Waarom dit telt:**')
    expect(result).toContain('**Wat in te vullen:**')
    expect(result).toContain('Vraag van de gebruiker: Welke multiple hoort hierbij?')
  })
})
