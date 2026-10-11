// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { formatAssistantFieldValue } from './assistantFieldValue'

describe('assistant field proposal labels', () => {
  it('formats financial amounts, headcount, years and text with their own units', () => {
    expect(formatAssistantFieldValue('revenue.2024', 2500000, 'nl-BE')).toBe('€2.500.000')
    expect(formatAssistantFieldValue('employees', 12.5, 'nl-BE')).toBe('12,5')
    expect(formatAssistantFieldValue('founding_year', 2019, 'nl-BE')).toBe('2019')
    expect(formatAssistantFieldValue('company_name', 'Demonlabs', 'nl-BE')).toBe('Demonlabs')
  })
})
